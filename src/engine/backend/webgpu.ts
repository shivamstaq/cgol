import { RULE_CONWAY } from '../defaults';
import { ALIVE, BACKGROUND } from '../palette';
import type { RuleSpec } from '../protocol';
import blitShader from '../shaders/blit.wgsl?raw';
import lifeShader from '../shaders/life.wgsl?raw';
import presentShader from '../shaders/present.wgsl?raw';
import stampShader from '../shaders/stamp.wgsl?raw';
import {
  getWebGPUContext,
  type Backend,
  type GridSpec,
  type RenderCanvas,
  type StampSpec,
} from './types';

const WORKGROUP = 8;
const BYTES_PER_WORD = 4;

interface Grid {
  cols: number;
  rows: number;
  wordsPerRow: number;
  wordCount: number;
  state: [GPUBuffer, GPUBuffer];
  seed: GPUBuffer;
  strokeBase: GPUBuffer;
  strokeMask: GPUBuffer;
}

export async function createWebGPUBackend(
  canvas: RenderCanvas,
  onLost: (reason: string) => void,
): Promise<Backend | null> {
  const gpu = navigator.gpu;
  if (!gpu) return null;

  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;

  const device = await adapter.requestDevice();
  const context = getWebGPUContext(canvas);
  if (!context) {
    device.destroy();
    return null;
  }

  const info = adapter.info;
  const label = [info?.vendor, info?.architecture, info?.description]
    .filter(Boolean)
    .join(' ')
    .trim();

  return new WebGPUBackend(device, context, gpu.getPreferredCanvasFormat(), label, onLost);
}

class WebGPUBackend implements Backend {
  readonly kind = 'webgpu' as const;
  readonly device: string;
  readonly simulates = true;

  readonly #gpu: GPUDevice;
  readonly #context: GPUCanvasContext;
  readonly #format: GPUTextureFormat;

  readonly #stepPipeline: GPUComputePipeline;
  readonly #stampPipeline: GPUComputePipeline;
  readonly #blitPipeline: GPUComputePipeline;
  readonly #presentPipeline: GPURenderPipeline;

  readonly #gridUniform: GPUBuffer;
  readonly #viewUniform: GPUBuffer;
  readonly #stampUniform: GPUBuffer;
  readonly #blitUniform: GPUBuffer;

  #grid: Grid | null = null;
  #front = 0;
  #cellPx = 1;
  #rule: RuleSpec = RULE_CONWAY;
  #alive = true;

  #stepGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  #presentGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  #stampGroups: [GPUBindGroup, GPUBindGroup] | null = null;

  constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    label: string,
    onLost: (reason: string) => void,
  ) {
    this.#gpu = device;
    this.#context = context;
    this.#format = format;
    this.device = label || 'webgpu adapter';

    this.#configure();

    void device.lost.then((info) => {
      if (this.#alive) onLost(info.message || 'device lost');
      return info;
    });

    this.#stepPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: lifeShader }), entryPoint: 'step' },
    });
    this.#stampPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: stampShader }), entryPoint: 'apply' },
    });
    this.#blitPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: blitShader }), entryPoint: 'copy' },
    });

    const presentModule = device.createShaderModule({ code: presentShader });
    this.#presentPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: presentModule, entryPoint: 'vs' },
      fragment: { module: presentModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    this.#gridUniform = this.#uniform(32);
    this.#viewUniform = this.#uniform(48);
    this.#stampUniform = this.#uniform(64);
    this.#blitUniform = this.#uniform(32);
  }

  resizeSurface(): void {
    this.#configure();
  }

  allocate(grid: GridSpec): void {
    const wordsPerRow = Math.ceil(grid.cols / 32);
    const next: Grid = {
      cols: grid.cols,
      rows: grid.rows,
      wordsPerRow,
      wordCount: wordsPerRow * grid.rows,
      state: [this.#storage(wordsPerRow * grid.rows), this.#storage(wordsPerRow * grid.rows)],
      seed: this.#storage(wordsPerRow * grid.rows),
      strokeBase: this.#storage(wordsPerRow * grid.rows),
      strokeMask: this.#storage(wordsPerRow * grid.rows),
    };

    const previous = this.#grid;
    if (previous) {
      this.#carryOver(previous, next);
      for (const buffer of [
        previous.state[0],
        previous.state[1],
        previous.seed,
        previous.strokeBase,
        previous.strokeMask,
      ]) {
        buffer.destroy();
      }
    }

    this.#grid = next;
    this.#front = 0;
    this.#cellPx = grid.cellPx;
    this.#writeGridUniform();
    this.#writeViewUniform();
    this.#buildBindGroups();
  }

  setRule(rule: RuleSpec): void {
    this.#rule = rule;
    this.#writeGridUniform();
  }

  advance(steps: number): void {
    const grid = this.#grid;
    const groups = this.#stepGroups;
    if (!grid || !groups || steps <= 0) return;

    const encoder = this.#gpu.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.#stepPipeline);

    const x = Math.ceil(grid.wordsPerRow / WORKGROUP);
    const y = Math.ceil(grid.rows / WORKGROUP);
    for (let i = 0; i < steps; i += 1) {
      pass.setBindGroup(0, pick(groups, this.#front));
      pass.dispatchWorkgroups(x, y);
      this.#front ^= 1;
    }

    pass.end();
    this.#gpu.queue.submit([encoder.finish()]);
  }

  render(): void {
    const [r, g, b, a] = BACKGROUND;
    const encoder = this.#gpu.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.#context.getCurrentTexture().createView(),
          clearValue: { r, g, b, a },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    const groups = this.#presentGroups;
    if (groups) {
      pass.setPipeline(this.#presentPipeline);
      pass.setBindGroup(0, pick(groups, this.#front));
      pass.draw(3);
    }

    pass.end();
    this.#gpu.queue.submit([encoder.finish()]);
  }

  beginStroke(): void {
    const grid = this.#grid;
    if (!grid) return;

    const encoder = this.#gpu.createCommandEncoder();
    encoder.copyBufferToBuffer(
      pick(grid.state, this.#front),
      0,
      grid.strokeBase,
      0,
      grid.wordCount * BYTES_PER_WORD,
    );
    encoder.clearBuffer(grid.strokeMask);
    this.#gpu.queue.submit([encoder.finish()]);
  }

  stamp(spec: StampSpec): void {
    const grid = this.#grid;
    const groups = this.#stampGroups;
    if (!grid || !groups) return;

    const pad = spec.radius + 1;
    const minX = clamp(Math.floor(Math.min(spec.x0, spec.x1) - pad), 0, grid.cols - 1);
    const maxX = clamp(Math.ceil(Math.max(spec.x0, spec.x1) + pad), 0, grid.cols - 1);
    const minY = clamp(Math.floor(Math.min(spec.y0, spec.y1) - pad), 0, grid.rows - 1);
    const maxY = clamp(Math.ceil(Math.max(spec.y0, spec.y1) + pad), 0, grid.rows - 1);

    const originWord = Math.floor(minX / 32);
    const lastWord = Math.floor(maxX / 32);

    const data = new ArrayBuffer(64);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);
    u32[0] = grid.cols;
    u32[1] = grid.rows;
    u32[2] = grid.wordsPerRow;
    u32[3] = spec.shape;
    f32[4] = spec.x0;
    f32[5] = spec.y0;
    f32[6] = spec.x1;
    f32[7] = spec.y1;
    f32[8] = spec.radius;
    f32[9] = spec.scatter;
    u32[10] = spec.seed;
    u32[11] = originWord;
    u32[12] = minY;
    this.#gpu.queue.writeBuffer(this.#stampUniform, 0, data);

    const encoder = this.#gpu.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.#stampPipeline);
    pass.setBindGroup(0, pick(groups, this.#front));
    pass.dispatchWorkgroups(
      Math.ceil((lastWord - originWord + 1) / WORKGROUP),
      Math.ceil((maxY - minY + 1) / WORKGROUP),
    );
    pass.end();
    this.#gpu.queue.submit([encoder.finish()]);
  }

  snapshotSeed(): void {
    this.#copyState(true);
  }

  restoreSeed(): void {
    this.#copyState(false);
  }

  clear(): void {
    const grid = this.#grid;
    if (!grid) return;

    const encoder = this.#gpu.createCommandEncoder();
    encoder.clearBuffer(pick(grid.state, this.#front));
    this.#gpu.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.#alive = false;
    const grid = this.#grid;
    if (grid) {
      for (const buffer of [
        grid.state[0],
        grid.state[1],
        grid.seed,
        grid.strokeBase,
        grid.strokeMask,
      ]) {
        buffer.destroy();
      }
    }
    this.#grid = null;
    this.#context.unconfigure();
    this.#gpu.destroy();
  }

  #configure(): void {
    this.#context.configure({ device: this.#gpu, format: this.#format, alphaMode: 'opaque' });
  }

  #uniform(size: number): GPUBuffer {
    return this.#gpu.createBuffer({
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  #storage(words: number): GPUBuffer {
    return this.#gpu.createBuffer({
      size: Math.max(words, 1) * BYTES_PER_WORD,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
  }

  #copyState(toSeed: boolean): void {
    const grid = this.#grid;
    if (!grid) return;

    const encoder = this.#gpu.createCommandEncoder();
    const size = grid.wordCount * BYTES_PER_WORD;
    if (toSeed) {
      encoder.copyBufferToBuffer(pick(grid.state, this.#front), 0, grid.seed, 0, size);
    } else {
      encoder.copyBufferToBuffer(grid.seed, 0, pick(grid.state, this.#front), 0, size);
    }
    this.#gpu.queue.submit([encoder.finish()]);
  }

  /** Centre-anchored copy of state and seed into freshly sized buffers. */
  #carryOver(previous: Grid, next: Grid): void {
    const data = new ArrayBuffer(32);
    const u32 = new Uint32Array(data);
    const i32 = new Int32Array(data);
    u32[0] = next.cols;
    u32[1] = next.rows;
    u32[2] = next.wordsPerRow;
    u32[3] = previous.cols;
    u32[4] = previous.rows;
    u32[5] = previous.wordsPerRow;
    i32[6] = Math.floor((next.cols - previous.cols) / 2);
    i32[7] = Math.floor((next.rows - previous.rows) / 2);
    this.#gpu.queue.writeBuffer(this.#blitUniform, 0, data);

    const encoder = this.#gpu.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.#blitPipeline);

    const x = Math.ceil(next.wordsPerRow / WORKGROUP);
    const y = Math.ceil(next.rows / WORKGROUP);

    for (const [source, target] of [
      [pick(previous.state, this.#front), next.state[0]],
      [previous.seed, next.seed],
    ] as const) {
      pass.setBindGroup(
        0,
        this.#gpu.createBindGroup({
          layout: this.#blitPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.#blitUniform } },
            { binding: 1, resource: { buffer: source } },
            { binding: 2, resource: { buffer: target } },
          ],
        }),
      );
      pass.dispatchWorkgroups(x, y);
    }

    pass.end();
    this.#gpu.queue.submit([encoder.finish()]);
  }

  #writeGridUniform(): void {
    const grid = this.#grid;
    if (!grid) return;

    this.#gpu.queue.writeBuffer(
      this.#gridUniform,
      0,
      new Uint32Array([
        grid.cols,
        grid.rows,
        grid.wordsPerRow,
        this.#rule.birth,
        this.#rule.survive,
        0,
        0,
        0,
      ]),
    );
  }

  #writeViewUniform(): void {
    const grid = this.#grid;
    if (!grid) return;

    const data = new ArrayBuffer(48);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);
    u32[0] = grid.cols;
    u32[1] = grid.rows;
    u32[2] = grid.wordsPerRow;
    f32[3] = this.#cellPx;
    f32.set(ALIVE, 4);
    f32.set(BACKGROUND, 8);
    this.#gpu.queue.writeBuffer(this.#viewUniform, 0, data);
  }

  #buildBindGroups(): void {
    const grid = this.#grid;
    if (!grid) return;

    this.#stepGroups = pair((front) =>
      this.#gpu.createBindGroup({
        layout: this.#stepPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.#gridUniform } },
          { binding: 1, resource: { buffer: pick(grid.state, front) } },
          { binding: 2, resource: { buffer: pick(grid.state, front ^ 1) } },
        ],
      }),
    );

    this.#presentGroups = pair((front) =>
      this.#gpu.createBindGroup({
        layout: this.#presentPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.#viewUniform } },
          { binding: 1, resource: { buffer: pick(grid.state, front) } },
        ],
      }),
    );

    this.#stampGroups = pair((front) =>
      this.#gpu.createBindGroup({
        layout: this.#stampPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.#stampUniform } },
          { binding: 1, resource: { buffer: grid.strokeBase } },
          { binding: 2, resource: { buffer: grid.strokeMask } },
          { binding: 3, resource: { buffer: pick(grid.state, front) } },
        ],
      }),
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pick<T>(values: readonly [T, T], index: number): T {
  return index === 0 ? values[0] : values[1];
}

function pair<T>(make: (front: number) => T): [T, T] {
  return [make(0), make(1)];
}
