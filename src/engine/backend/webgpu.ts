import {
  BIRTH_MS,
  DEATH_SHRINK_MS,
  DEATH_TOTAL_MS,
  EMISSIVE_MIPS,
  GEOMETRY_MIN_CELL_PX,
  GLOW_STRENGTH,
  GRID_MIN_CELL_PX,
  RULE_CONWAY,
} from '../defaults';
import { PALETTES } from '../palette';
import type { RuleSpec } from '../protocol';
import blitShader from '../shaders/blit.wgsl?raw';
import downsampleShader from '../shaders/downsample.wgsl?raw';
import emissiveShader from '../shaders/emissive.wgsl?raw';
import fxShader from '../shaders/fx.wgsl?raw';
import lifeShader from '../shaders/life.wgsl?raw';
import populationShader from '../shaders/population.wgsl?raw';
import presentShader from '../shaders/present.wgsl?raw';
import stampShader from '../shaders/stamp.wgsl?raw';
import {
  getWebGPUContext,
  type Backend,
  type GridSpec,
  type RenderCanvas,
  type ResolvedVisuals,
  type StampSpec,
} from './types';

const WORKGROUP = 8;
const BYTES_PER_WORD = 4;
const EMISSIVE_FORMAT: GPUTextureFormat = 'rgba8unorm';

interface Grid {
  cols: number;
  rows: number;
  wordsPerRow: number;
  wordCount: number;
  cellCount: number;
  state: [GPUBuffer, GPUBuffer];
  seed: GPUBuffer;
  strokeBase: GPUBuffer;
  strokeMask: GPUBuffer;
  fx: GPUBuffer;
  emissive: GPUTexture;
  emissiveView: GPUTextureView;
  mips: { source: GPUTextureView; target: GPUTextureView }[];
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
  readonly #sampler: GPUSampler;

  readonly #stepPipeline: GPUComputePipeline;
  readonly #stampPipeline: GPUComputePipeline;
  readonly #blitPipeline: GPUComputePipeline;
  readonly #fxPipeline: GPUComputePipeline;
  readonly #populationPipeline: GPUComputePipeline;
  readonly #emissivePipeline: GPURenderPipeline;
  readonly #downsamplePipeline: GPURenderPipeline;
  readonly #presentPipeline: GPURenderPipeline;

  readonly #gridUniform: GPUBuffer;
  readonly #viewUniform: GPUBuffer;
  readonly #stampUniform: GPUBuffer;
  readonly #blitUniform: GPUBuffer;
  readonly #fxUniform: GPUBuffer;
  readonly #emissiveUniform: GPUBuffer;

  #grid: Grid | null = null;
  #front = 0;
  #cellPx = 1;
  #rule: RuleSpec = RULE_CONWAY;
  #visuals: ResolvedVisuals = {
    palette: PALETTES.aurora,
    glow: GLOW_STRENGTH.subtle,
    gridLines: true,
  };
  #alive = true;

  #stepGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  #presentGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  #stampGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  #fxGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  #emissiveGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  #mipGroups: GPUBindGroup[] = [];
  #populationGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  #populationTotal: GPUBuffer | null = null;
  #populationStaging: GPUBuffer | null = null;
  #population = 0;
  #populationPending = false;

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

    device.addEventListener('uncapturederror', (event) => {
      if (this.#alive) onLost(event.error.message);
    });

    const compute = (code: string, entryPoint: string) =>
      device.createComputePipeline({
        layout: 'auto',
        compute: { module: device.createShaderModule({ code }), entryPoint },
      });

    this.#stepPipeline = compute(lifeShader, 'step');
    this.#stampPipeline = compute(stampShader, 'apply');
    this.#blitPipeline = compute(blitShader, 'copy');
    this.#fxPipeline = compute(fxShader, 'update');
    this.#populationPipeline = compute(populationShader, 'count');

    const render = (code: string, target: GPUTextureFormat) => {
      const module = device.createShaderModule({ code });
      return device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: target }] },
        primitive: { topology: 'triangle-list' },
      });
    };

    this.#emissivePipeline = render(emissiveShader, EMISSIVE_FORMAT);
    this.#downsamplePipeline = render(downsampleShader, EMISSIVE_FORMAT);
    this.#presentPipeline = render(presentShader, format);

    this.#sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });

    this.#gridUniform = this.#uniform(32);
    this.#viewUniform = this.#uniform(96);
    this.#stampUniform = this.#uniform(64);
    this.#blitUniform = this.#uniform(32);
    this.#fxUniform = this.#uniform(32);
    this.#emissiveUniform = this.#uniform(64);
  }

  resizeSurface(): void {
    this.#configure();
  }

  allocate(spec: GridSpec): void {
    const wordsPerRow = Math.ceil(spec.cols / 32);
    const next = this.#createGrid(spec.cols, spec.rows, wordsPerRow);
    const previous = this.#grid;

    if (previous) {
      this.#carryOver(previous, next);
      this.#destroyGrid(previous);
    }

    if (!this.#populationTotal) {
      this.#populationTotal = this.#gpu.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      this.#populationStaging = this.#gpu.createBuffer({
        size: 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
    }

    this.#grid = next;
    this.#front = 0;
    this.#cellPx = spec.cellPx;
    this.#writeGridUniform();
    this.#writeViewUniform();
    this.#writeEmissiveUniform();
    this.#buildBindGroups();
  }

  setRule(rule: RuleSpec): void {
    this.#rule = rule;
    this.#writeGridUniform();
  }

  setVisuals(visuals: ResolvedVisuals): void {
    this.#visuals = visuals;
    this.#writeViewUniform();
    this.#writeEmissiveUniform();
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

  render(deltaMs: number, stepped: boolean): void {
    const grid = this.#grid;
    const encoder = this.#gpu.createCommandEncoder();

    if (grid && this.#fxGroups) {
      this.#gpu.queue.writeBuffer(this.#fxUniform, 0, fxParams(grid, deltaMs, stepped));

      const pass = encoder.beginComputePass();
      pass.setPipeline(this.#fxPipeline);
      pass.setBindGroup(0, pick(this.#fxGroups, this.#front));
      pass.dispatchWorkgroups(Math.ceil(grid.cols / WORKGROUP), Math.ceil(grid.rows / WORKGROUP));
      pass.end();
    }

    if (grid && this.#visuals.glow > 0 && this.#emissiveGroups) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view: grid.mips[0]?.source ?? grid.emissiveView, loadOp: 'clear', storeOp: 'store' },
        ],
      });
      pass.setPipeline(this.#emissivePipeline);
      pass.setBindGroup(0, pick(this.#emissiveGroups, this.#front));
      pass.draw(3);
      pass.end();

      grid.mips.forEach((level, index) => {
        const group = this.#mipGroups[index];
        if (!group) return;

        const mip = encoder.beginRenderPass({
          colorAttachments: [{ view: level.target, loadOp: 'clear', storeOp: 'store' }],
        });
        mip.setPipeline(this.#downsamplePipeline);
        mip.setBindGroup(0, group);
        mip.draw(3);
        mip.end();
      });
    }

    const [r, g, b, a] = this.#visuals.palette.bg;
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

    if (this.#presentGroups) {
      pass.setPipeline(this.#presentPipeline);
      pass.setBindGroup(0, pick(this.#presentGroups, this.#front));
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

  async readState(): Promise<Uint32Array> {
    const grid = this.#grid;
    if (!grid) return new Uint32Array(0);

    const size = grid.wordCount * BYTES_PER_WORD;
    const staging = this.#gpu.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.#gpu.createCommandEncoder();
    encoder.copyBufferToBuffer(pick(grid.state, this.#front), 0, staging, 0, size);
    this.#gpu.queue.submit([encoder.finish()]);

    await staging.mapAsync(GPUMapMode.READ);
    const words = new Uint32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();

    return words;
  }

  writeState(words: Uint32Array): void {
    const grid = this.#grid;
    if (!grid) return;
    this.#gpu.queue.writeBuffer(pick(grid.state, this.#front), 0, words);
  }

  samplePopulation(): number {
    const grid = this.#grid;
    const groups = this.#populationGroups;
    const total = this.#populationTotal;
    const staging = this.#populationStaging;
    if (!grid || !groups || !total || !staging || this.#populationPending) return this.#population;

    this.#populationPending = true;

    const encoder = this.#gpu.createCommandEncoder();
    encoder.clearBuffer(total);
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.#populationPipeline);
    pass.setBindGroup(0, pick(groups, this.#front));
    pass.dispatchWorkgroups(Math.ceil(grid.wordCount / 64));
    pass.end();
    encoder.copyBufferToBuffer(total, 0, staging, 0, 4);
    this.#gpu.queue.submit([encoder.finish()]);

    void staging
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        this.#population = new Uint32Array(staging.getMappedRange())[0] ?? 0;
        staging.unmap();
        this.#populationPending = false;
        return this.#population;
      })
      .catch(() => {
        this.#populationPending = false;
      });

    return this.#population;
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
    this.#populationTotal?.destroy();
    this.#populationStaging?.destroy();
    if (this.#grid) this.#destroyGrid(this.#grid);
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

  #createGrid(cols: number, rows: number, wordsPerRow: number): Grid {
    const wordCount = wordsPerRow * rows;
    const cellCount = cols * rows;
    const levels = Math.min(EMISSIVE_MIPS, 1 + Math.floor(Math.log2(Math.max(cols, rows, 1))));

    const emissive = this.#gpu.createTexture({
      size: { width: cols, height: rows },
      format: EMISSIVE_FORMAT,
      mipLevelCount: levels,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const mips = [];
    for (let level = 1; level < levels; level += 1) {
      mips.push({
        source: emissive.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }),
        target: emissive.createView({ baseMipLevel: level, mipLevelCount: 1 }),
      });
    }

    return {
      cols,
      rows,
      wordsPerRow,
      wordCount,
      cellCount,
      state: [this.#storage(wordCount), this.#storage(wordCount)],
      seed: this.#storage(wordCount),
      strokeBase: this.#storage(wordCount),
      strokeMask: this.#storage(wordCount),
      fx: this.#storage(cellCount),
      emissive,
      emissiveView: emissive.createView({ baseMipLevel: 0, mipLevelCount: 1 }),
      mips,
    };
  }

  #destroyGrid(grid: Grid): void {
    for (const buffer of [
      grid.state[0],
      grid.state[1],
      grid.seed,
      grid.strokeBase,
      grid.strokeMask,
      grid.fx,
    ]) {
      buffer.destroy();
    }
    grid.emissive.destroy();
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

    const { palette, glow, gridLines } = this.#visuals;
    const data = new ArrayBuffer(96);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);

    u32[0] = grid.cols;
    u32[1] = grid.rows;
    u32[2] = grid.wordsPerRow;
    f32[3] = this.#cellPx;
    f32.set(palette.alive, 4);
    f32.set(palette.bg, 8);
    f32.set(palette.birth, 12);
    f32.set(palette.death, 16);
    f32[20] = glow;
    f32[21] = gridLines && this.#cellPx >= GRID_MIN_CELL_PX ? 1 : 0;
    f32[22] = this.#cellPx >= GEOMETRY_MIN_CELL_PX ? 1 : 0;
    f32[23] = DEATH_SHRINK_MS / DEATH_TOTAL_MS;

    this.#gpu.queue.writeBuffer(this.#viewUniform, 0, data);
  }

  #writeEmissiveUniform(): void {
    const grid = this.#grid;
    if (!grid) return;

    const { palette } = this.#visuals;
    const data = new ArrayBuffer(64);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);

    u32[0] = grid.cols;
    u32[1] = grid.rows;
    u32[2] = grid.wordsPerRow;
    f32.set(palette.alive, 4);
    f32.set(palette.birth, 8);
    f32.set(palette.death, 12);

    this.#gpu.queue.writeBuffer(this.#emissiveUniform, 0, data);
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

    this.#fxGroups = pair((front) =>
      this.#gpu.createBindGroup({
        layout: this.#fxPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.#fxUniform } },
          { binding: 1, resource: { buffer: pick(grid.state, front) } },
          { binding: 2, resource: { buffer: pick(grid.state, front ^ 1) } },
          { binding: 3, resource: { buffer: grid.fx } },
        ],
      }),
    );

    this.#emissiveGroups = pair((front) =>
      this.#gpu.createBindGroup({
        layout: this.#emissivePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.#emissiveUniform } },
          { binding: 1, resource: { buffer: pick(grid.state, front) } },
          { binding: 2, resource: { buffer: grid.fx } },
        ],
      }),
    );

    this.#presentGroups = pair((front) =>
      this.#gpu.createBindGroup({
        layout: this.#presentPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.#viewUniform } },
          { binding: 1, resource: { buffer: pick(grid.state, front) } },
          { binding: 2, resource: { buffer: grid.fx } },
          { binding: 3, resource: grid.emissive.createView() },
          { binding: 4, resource: this.#sampler },
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

    const total = this.#populationTotal;
    if (total) {
      this.#populationGroups = pair((front) =>
        this.#gpu.createBindGroup({
          layout: this.#populationPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: pick(grid.state, front) } },
            { binding: 1, resource: { buffer: total } },
          ],
        }),
      );
    }

    this.#mipGroups = grid.mips.map((level) =>
      this.#gpu.createBindGroup({
        layout: this.#downsamplePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: level.source },
          { binding: 1, resource: this.#sampler },
        ],
      }),
    );
  }
}

function fxParams(grid: Grid, deltaMs: number, stepped: boolean): ArrayBuffer {
  const data = new ArrayBuffer(32);
  const u32 = new Uint32Array(data);
  const f32 = new Float32Array(data);

  u32[0] = grid.cols;
  u32[1] = grid.rows;
  u32[2] = grid.wordsPerRow;
  u32[3] = stepped ? 1 : 0;
  f32[4] = deltaMs / BIRTH_MS;
  f32[5] = deltaMs / DEATH_TOTAL_MS;

  return data;
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
