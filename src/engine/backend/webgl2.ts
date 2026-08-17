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
import blitFrag from '../shaders/gl/blit.frag.glsl?raw';
import copyFrag from '../shaders/gl/copy.frag.glsl?raw';
import emissiveFrag from '../shaders/gl/emissive.frag.glsl?raw';
import fxFrag from '../shaders/gl/fx.frag.glsl?raw';
import lifeFrag from '../shaders/gl/life.frag.glsl?raw';
import populationFrag from '../shaders/gl/population.frag.glsl?raw';
import presentFrag from '../shaders/gl/present.frag.glsl?raw';
import quadVert from '../shaders/gl/quad.vert.glsl?raw';
import stampFrag from '../shaders/gl/stamp.frag.glsl?raw';
import {
  getWebGL2Context,
  type Backend,
  type GridSpec,
  type RenderCanvas,
  type ResolvedVisuals,
  type StampSpec,
} from './types';

interface Program {
  program: WebGLProgram;
  at(name: string): WebGLUniformLocation | null;
}

interface TextureOptions {
  format: number;
  levels: number;
  linear: boolean;
}

interface Grid {
  cols: number;
  rows: number;
  wordsPerRow: number;
  state: [WebGLTexture, WebGLTexture];
  mask: [WebGLTexture, WebGLTexture];
  fx: [WebGLTexture, WebGLTexture];
  seed: WebGLTexture;
  base: WebGLTexture;
  emissive: WebGLTexture;
  rowCounts: WebGLTexture;
  stateFbo: [WebGLFramebuffer, WebGLFramebuffer];
  maskFbo: [WebGLFramebuffer, WebGLFramebuffer];
  fxFbo: [WebGLFramebuffer, WebGLFramebuffer];
  seedFbo: WebGLFramebuffer;
  baseFbo: WebGLFramebuffer;
  emissiveFbo: WebGLFramebuffer;
  rowCountsFbo: WebGLFramebuffer;
  /** [mask target][state target] */
  stampFbo: [[WebGLFramebuffer, WebGLFramebuffer], [WebGLFramebuffer, WebGLFramebuffer]];
}

export function createWebGL2Backend(canvas: RenderCanvas): Backend | null {
  const gl = getWebGL2Context(canvas, {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  return new WebGL2Backend(gl);
}

class WebGL2Backend implements Backend {
  readonly kind = 'webgl2' as const;
  readonly device: string;
  readonly simulates = true;

  readonly #gl: WebGL2RenderingContext;
  readonly #step: Program;
  readonly #stamp: Program;
  readonly #blit: Program;
  readonly #copy: Program;
  readonly #fx: Program;
  readonly #emissive: Program;
  readonly #present: Program;
  readonly #population: Program;

  #grid: Grid | null = null;
  #front = 0;
  #maskFront = 0;
  #fxFront = 0;
  #cellPx = 1;
  #width = 1;
  #height = 1;
  #rule: RuleSpec = RULE_CONWAY;
  #populationValue = 0;
  #populationPack: WebGLBuffer | null = null;
  #populationFence: WebGLSync | null = null;
  #visuals: ResolvedVisuals = {
    palette: PALETTES.aurora,
    glow: GLOW_STRENGTH.subtle,
    gridLines: true,
  };

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    this.device = String(
      debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    );

    const vertex = compile(gl, gl.VERTEX_SHADER, quadVert);
    this.#step = program(gl, vertex, lifeFrag, ['uSrc', 'uCols', 'uRows', 'uBirth', 'uSurvive']);
    this.#stamp = program(gl, vertex, stampFrag, [
      'uBase',
      'uMask',
      'uCols',
      'uShape',
      'uP0',
      'uP1',
      'uRadius',
      'uScatter',
      'uSeed',
    ]);
    this.#blit = program(gl, vertex, blitFrag, [
      'uSrc',
      'uCols',
      'uSrcCols',
      'uSrcRows',
      'uDx',
      'uDy',
    ]);
    this.#copy = program(gl, vertex, copyFrag, ['uSrc']);
    this.#fx = program(gl, vertex, fxFrag, [
      'uCurrent',
      'uPrevious',
      'uFx',
      'uStepped',
      'uBirthDecay',
      'uDeathDecay',
    ]);
    this.#emissive = program(gl, vertex, emissiveFrag, [
      'uState',
      'uFx',
      'uCols',
      'uRows',
      'uAlive',
      'uBirth',
      'uDeath',
    ]);
    this.#population = program(gl, vertex, populationFrag, ['uState', 'uWordsPerRow']);
    this.#present = program(gl, vertex, presentFrag, [
      'uState',
      'uFx',
      'uEmissive',
      'uCols',
      'uRows',
      'uCellPx',
      'uHeight',
      'uGlow',
      'uGrid',
      'uGeometry',
      'uShrink',
      'uAlive',
      'uDead',
      'uBirth',
      'uDeath',
    ]);

    this.#width = gl.drawingBufferWidth;
    this.#height = gl.drawingBufferHeight;
  }

  resizeSurface(width: number, height: number): void {
    this.#width = width;
    this.#height = height;
  }

  allocate(spec: GridSpec): void {
    const gl = this.#gl;
    const wordsPerRow = Math.ceil(spec.cols / 32);
    const next = this.#createGrid(spec.cols, spec.rows, wordsPerRow);
    const previous = this.#grid;

    if (previous) {
      gl.useProgram(this.#blit.program);
      gl.uniform1ui(this.#blit.at('uCols'), next.cols);
      gl.uniform1ui(this.#blit.at('uSrcCols'), previous.cols);
      gl.uniform1ui(this.#blit.at('uSrcRows'), previous.rows);
      gl.uniform1i(this.#blit.at('uDx'), Math.floor((next.cols - previous.cols) / 2));
      gl.uniform1i(this.#blit.at('uDy'), Math.floor((next.rows - previous.rows) / 2));

      this.#bind(0, pick(previous.state, this.#front), this.#blit.at('uSrc'));
      this.#draw(next.stateFbo[0], wordsPerRow, next.rows);
      this.#bind(0, previous.seed, this.#blit.at('uSrc'));
      this.#draw(next.seedFbo, wordsPerRow, next.rows);

      this.#destroyGrid(previous);
    }

    this.#grid = next;
    this.#front = 0;
    this.#maskFront = 0;
    this.#fxFront = 0;
    this.#cellPx = spec.cellPx;
  }

  setRule(rule: RuleSpec): void {
    this.#rule = rule;
  }

  setVisuals(visuals: ResolvedVisuals): void {
    this.#visuals = visuals;
  }

  advance(steps: number): void {
    const grid = this.#grid;
    if (!grid || steps <= 0) return;

    const gl = this.#gl;
    gl.useProgram(this.#step.program);
    gl.uniform1ui(this.#step.at('uCols'), grid.cols);
    gl.uniform1ui(this.#step.at('uRows'), grid.rows);
    gl.uniform1ui(this.#step.at('uBirth'), this.#rule.birth);
    gl.uniform1ui(this.#step.at('uSurvive'), this.#rule.survive);

    for (let i = 0; i < steps; i += 1) {
      this.#bind(0, pick(grid.state, this.#front), this.#step.at('uSrc'));
      this.#draw(pick(grid.stateFbo, this.#front ^ 1), grid.wordsPerRow, grid.rows);
      this.#front ^= 1;
    }
  }

  render(deltaMs: number, stepped: boolean): void {
    const gl = this.#gl;
    const grid = this.#grid;
    const { palette, glow, gridLines } = this.#visuals;

    if (grid) {
      this.#updateFx(grid, deltaMs, stepped);
      if (glow > 0) this.#updateEmissive(grid);
    }

    const [r, g, b, a] = palette.bg;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.#width, this.#height);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!grid) return;

    gl.useProgram(this.#present.program);
    gl.uniform1ui(this.#present.at('uCols'), grid.cols);
    gl.uniform1ui(this.#present.at('uRows'), grid.rows);
    gl.uniform1f(this.#present.at('uCellPx'), this.#cellPx);
    gl.uniform1f(this.#present.at('uHeight'), this.#height);
    gl.uniform1f(this.#present.at('uGlow'), glow);
    gl.uniform1f(this.#present.at('uGrid'), gridLines && this.#cellPx >= GRID_MIN_CELL_PX ? 1 : 0);
    gl.uniform1f(this.#present.at('uGeometry'), this.#cellPx >= GEOMETRY_MIN_CELL_PX ? 1 : 0);
    gl.uniform1f(this.#present.at('uShrink'), DEATH_SHRINK_MS / DEATH_TOTAL_MS);
    gl.uniform4fv(this.#present.at('uAlive'), palette.alive);
    gl.uniform4fv(this.#present.at('uDead'), palette.bg);
    gl.uniform4fv(this.#present.at('uBirth'), palette.birth);
    gl.uniform4fv(this.#present.at('uDeath'), palette.death);

    this.#bind(0, pick(grid.state, this.#front), this.#present.at('uState'));
    this.#bind(1, pick(grid.fx, this.#fxFront), this.#present.at('uFx'));
    this.#bind(2, grid.emissive, this.#present.at('uEmissive'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  beginStroke(): void {
    const grid = this.#grid;
    if (!grid) return;

    const gl = this.#gl;
    gl.useProgram(this.#copy.program);
    this.#bind(0, pick(grid.state, this.#front), this.#copy.at('uSrc'));
    this.#draw(grid.baseFbo, grid.wordsPerRow, grid.rows);

    for (const fbo of grid.maskFbo) this.#clearInteger(fbo);
    this.#maskFront = 0;
  }

  stamp(spec: StampSpec): void {
    const grid = this.#grid;
    if (!grid) return;

    const gl = this.#gl;
    gl.useProgram(this.#stamp.program);
    gl.uniform1ui(this.#stamp.at('uCols'), grid.cols);
    gl.uniform1ui(this.#stamp.at('uShape'), spec.shape);
    gl.uniform2f(this.#stamp.at('uP0'), spec.x0, spec.y0);
    gl.uniform2f(this.#stamp.at('uP1'), spec.x1, spec.y1);
    gl.uniform1f(this.#stamp.at('uRadius'), spec.radius);
    gl.uniform1f(this.#stamp.at('uScatter'), spec.scatter);
    gl.uniform1ui(this.#stamp.at('uSeed'), spec.seed);

    this.#bind(0, grid.base, this.#stamp.at('uBase'));
    this.#bind(1, pick(grid.mask, this.#maskFront), this.#stamp.at('uMask'));

    const target = pick(grid.stampFbo, this.#maskFront ^ 1);
    this.#draw(pick(target, this.#front), grid.wordsPerRow, grid.rows);
    this.#maskFront ^= 1;
  }

  readState(): Promise<Uint32Array> {
    const grid = this.#grid;
    if (!grid) return Promise.resolve(new Uint32Array(0));

    const gl = this.#gl;
    const words = new Uint32Array(grid.wordsPerRow * grid.rows);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pick(grid.stateFbo, this.#front));
    gl.readPixels(0, 0, grid.wordsPerRow, grid.rows, gl.RED_INTEGER, gl.UNSIGNED_INT, words);

    return Promise.resolve(words);
  }

  writeState(words: Uint32Array): void {
    const grid = this.#grid;
    if (!grid) return;

    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, pick(grid.state, this.#front));
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      grid.wordsPerRow,
      grid.rows,
      gl.RED_INTEGER,
      gl.UNSIGNED_INT,
      words,
    );
  }

  samplePopulation(): number {
    const grid = this.#grid;
    if (!grid) return this.#populationValue;

    const gl = this.#gl;
    this.#collectPopulation(grid);
    if (this.#populationFence) return this.#populationValue;

    gl.useProgram(this.#population.program);
    gl.uniform1ui(this.#population.at('uWordsPerRow'), grid.wordsPerRow);
    this.#bind(0, pick(grid.state, this.#front), this.#population.at('uState'));
    this.#draw(grid.rowCountsFbo, 1, grid.rows);

    this.#populationPack ??= gl.createBuffer();
    const pack = this.#populationPack;
    if (!pack) return this.#populationValue;

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, grid.rows * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, 1, grid.rows, gl.RED_INTEGER, gl.UNSIGNED_INT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.#populationFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

    return this.#populationValue;
  }

  snapshotSeed(): void {
    const grid = this.#grid;
    if (!grid) return;
    this.#copyTexture(pick(grid.state, this.#front), grid.seedFbo, grid);
  }

  restoreSeed(): void {
    const grid = this.#grid;
    if (!grid) return;
    this.#copyTexture(grid.seed, pick(grid.stateFbo, this.#front), grid);
  }

  clear(): void {
    const grid = this.#grid;
    if (!grid) return;
    this.#clearInteger(pick(grid.stateFbo, this.#front));
  }

  dispose(): void {
    if (this.#populationFence) this.#gl.deleteSync(this.#populationFence);
    if (this.#populationPack) this.#gl.deleteBuffer(this.#populationPack);
    if (this.#grid) this.#destroyGrid(this.#grid);
    this.#grid = null;
    this.#gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  /** Reads the pending row-count buffer once the GPU has finished with it. */
  #collectPopulation(grid: Grid): void {
    const gl = this.#gl;
    const fence = this.#populationFence;
    const pack = this.#populationPack;
    if (!fence || !pack) return;

    const status = gl.clientWaitSync(fence, 0, 0);
    if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) return;

    gl.deleteSync(fence);
    this.#populationFence = null;

    const counts = new Uint32Array(grid.rows);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, counts);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    this.#populationValue = counts.reduce((total, value) => total + value, 0);
  }

  #updateFx(grid: Grid, deltaMs: number, stepped: boolean): void {
    const gl = this.#gl;
    gl.useProgram(this.#fx.program);
    gl.uniform1ui(this.#fx.at('uStepped'), stepped ? 1 : 0);
    gl.uniform1f(this.#fx.at('uBirthDecay'), deltaMs / BIRTH_MS);
    gl.uniform1f(this.#fx.at('uDeathDecay'), deltaMs / DEATH_TOTAL_MS);

    this.#bind(0, pick(grid.state, this.#front), this.#fx.at('uCurrent'));
    this.#bind(1, pick(grid.state, this.#front ^ 1), this.#fx.at('uPrevious'));
    this.#bind(2, pick(grid.fx, this.#fxFront), this.#fx.at('uFx'));
    this.#draw(pick(grid.fxFbo, this.#fxFront ^ 1), grid.cols, grid.rows);
    this.#fxFront ^= 1;
  }

  #updateEmissive(grid: Grid): void {
    const gl = this.#gl;
    const { palette } = this.#visuals;

    gl.useProgram(this.#emissive.program);
    gl.uniform1ui(this.#emissive.at('uCols'), grid.cols);
    gl.uniform1ui(this.#emissive.at('uRows'), grid.rows);
    gl.uniform4fv(this.#emissive.at('uAlive'), palette.alive);
    gl.uniform4fv(this.#emissive.at('uBirth'), palette.birth);
    gl.uniform4fv(this.#emissive.at('uDeath'), palette.death);

    this.#bind(0, pick(grid.state, this.#front), this.#emissive.at('uState'));
    this.#bind(1, pick(grid.fx, this.#fxFront), this.#emissive.at('uFx'));
    this.#draw(grid.emissiveFbo, grid.cols, grid.rows);

    gl.bindTexture(gl.TEXTURE_2D, grid.emissive);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  #createGrid(cols: number, rows: number, wordsPerRow: number): Grid {
    const gl = this.#gl;
    const packed = () =>
      createTexture(gl, wordsPerRow, rows, { format: gl.R32UI, levels: 1, linear: false });
    const cellwise = () =>
      createTexture(gl, cols, rows, { format: gl.RGBA8, levels: 1, linear: false });

    const levels = Math.min(EMISSIVE_MIPS, 1 + Math.floor(Math.log2(Math.max(cols, rows, 1))));

    const state: [WebGLTexture, WebGLTexture] = [packed(), packed()];
    const mask: [WebGLTexture, WebGLTexture] = [packed(), packed()];
    const fx: [WebGLTexture, WebGLTexture] = [cellwise(), cellwise()];
    const seed = packed();
    const base = packed();
    const emissive = createTexture(gl, cols, rows, { format: gl.RGBA8, levels, linear: true });
    const rowCounts = createTexture(gl, 1, rows, { format: gl.R32UI, levels: 1, linear: false });

    const grid: Grid = {
      cols,
      rows,
      wordsPerRow,
      state,
      mask,
      fx,
      seed,
      base,
      emissive,
      rowCounts,
      stateFbo: [createFbo(gl, [state[0]]), createFbo(gl, [state[1]])],
      maskFbo: [createFbo(gl, [mask[0]]), createFbo(gl, [mask[1]])],
      fxFbo: [createFbo(gl, [fx[0]]), createFbo(gl, [fx[1]])],
      seedFbo: createFbo(gl, [seed]),
      baseFbo: createFbo(gl, [base]),
      emissiveFbo: createFbo(gl, [emissive]),
      rowCountsFbo: createFbo(gl, [rowCounts]),
      stampFbo: [
        [createFbo(gl, [mask[0], state[0]]), createFbo(gl, [mask[0], state[1]])],
        [createFbo(gl, [mask[1], state[0]]), createFbo(gl, [mask[1], state[1]])],
      ],
    };

    for (const fbo of [
      ...grid.stateFbo,
      ...grid.maskFbo,
      grid.seedFbo,
      grid.baseFbo,
      grid.rowCountsFbo,
    ]) {
      this.#clearInteger(fbo);
    }
    for (const fbo of [...grid.fxFbo, grid.emissiveFbo]) {
      this.#clearFloat(fbo);
    }

    return grid;
  }

  #destroyGrid(grid: Grid): void {
    const gl = this.#gl;
    for (const texture of [
      ...grid.state,
      ...grid.mask,
      ...grid.fx,
      grid.seed,
      grid.base,
      grid.emissive,
      grid.rowCounts,
    ]) {
      gl.deleteTexture(texture);
    }
    for (const fbo of [
      ...grid.stateFbo,
      ...grid.maskFbo,
      ...grid.fxFbo,
      grid.seedFbo,
      grid.baseFbo,
      grid.emissiveFbo,
      grid.rowCountsFbo,
      ...grid.stampFbo.flat(),
    ]) {
      gl.deleteFramebuffer(fbo);
    }
  }

  #copyTexture(source: WebGLTexture, target: WebGLFramebuffer, grid: Grid): void {
    this.#gl.useProgram(this.#copy.program);
    this.#bind(0, source, this.#copy.at('uSrc'));
    this.#draw(target, grid.wordsPerRow, grid.rows);
  }

  #clearInteger(fbo: WebGLFramebuffer): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));
  }

  #clearFloat(fbo: WebGLFramebuffer): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.clearBufferfv(gl.COLOR, 0, new Float32Array([0, 0, 0, 1]));
  }

  #bind(unit: number, texture: WebGLTexture, location: WebGLUniformLocation | null): void {
    const gl = this.#gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(location, unit);
  }

  #draw(fbo: WebGLFramebuffer, width: number, height: number): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  options: TextureOptions,
): WebGLTexture {
  const texture = must(gl.createTexture(), 'texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(
    gl.TEXTURE_2D,
    options.levels,
    options.format,
    Math.max(1, width),
    Math.max(1, height),
  );

  const minFilter = options.linear
    ? options.levels > 1
      ? gl.LINEAR_MIPMAP_LINEAR
      : gl.LINEAR
    : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return texture;
}

function createFbo(gl: WebGL2RenderingContext, attachments: WebGLTexture[]): WebGLFramebuffer {
  const fbo = must(gl.createFramebuffer(), 'framebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

  const targets: number[] = [];
  attachments.forEach((texture, index) => {
    const attachment = gl.COLOR_ATTACHMENT0 + index;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, texture, 0);
    targets.push(attachment);
  });
  gl.drawBuffers(targets);

  return fbo;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = must(gl.createShader(type), 'shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`webgl2 shader: ${gl.getShaderInfoLog(shader) ?? 'unknown error'}`);
  }
  return shader;
}

function program(
  gl: WebGL2RenderingContext,
  vertex: WebGLShader,
  fragmentSource: string,
  names: readonly string[],
): Program {
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const linked = must(gl.createProgram(), 'program');
  gl.attachShader(linked, vertex);
  gl.attachShader(linked, fragment);
  gl.linkProgram(linked);

  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
    throw new Error(`webgl2 link: ${gl.getProgramInfoLog(linked) ?? 'unknown error'}`);
  }

  const uniforms = new Map<string, WebGLUniformLocation | null>();
  for (const name of names) uniforms.set(name, gl.getUniformLocation(linked, name));

  return { program: linked, at: (name) => uniforms.get(name) ?? null };
}

function must<T>(value: T | null, what: string): T {
  if (!value) throw new Error(`webgl2: ${what} unavailable`);
  return value;
}

function pick<T>(values: readonly [T, T], index: number): T {
  return index === 0 ? values[0] : values[1];
}
