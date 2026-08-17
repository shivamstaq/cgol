import { RULE_CONWAY } from '../defaults';
import { ALIVE, BACKGROUND } from '../palette';
import type { RuleSpec } from '../protocol';
import blitFrag from '../shaders/gl/blit.frag.glsl?raw';
import copyFrag from '../shaders/gl/copy.frag.glsl?raw';
import lifeFrag from '../shaders/gl/life.frag.glsl?raw';
import presentFrag from '../shaders/gl/present.frag.glsl?raw';
import quadVert from '../shaders/gl/quad.vert.glsl?raw';
import stampFrag from '../shaders/gl/stamp.frag.glsl?raw';
import {
  getWebGL2Context,
  type Backend,
  type GridSpec,
  type RenderCanvas,
  type StampSpec,
} from './types';

interface Program {
  program: WebGLProgram;
  at(name: string): WebGLUniformLocation | null;
}

interface Grid {
  cols: number;
  rows: number;
  wordsPerRow: number;
  state: [WebGLTexture, WebGLTexture];
  mask: [WebGLTexture, WebGLTexture];
  seed: WebGLTexture;
  base: WebGLTexture;
  stateFbo: [WebGLFramebuffer, WebGLFramebuffer];
  maskFbo: [WebGLFramebuffer, WebGLFramebuffer];
  seedFbo: WebGLFramebuffer;
  baseFbo: WebGLFramebuffer;
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
  readonly #present: Program;

  #grid: Grid | null = null;
  #front = 0;
  #maskFront = 0;
  #cellPx = 1;
  #width = 1;
  #height = 1;
  #rule: RuleSpec = RULE_CONWAY;

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
    this.#present = program(gl, vertex, presentFrag, [
      'uState',
      'uCols',
      'uRows',
      'uCellPx',
      'uHeight',
      'uAlive',
      'uDead',
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
      const dx = Math.floor((next.cols - previous.cols) / 2);
      const dy = Math.floor((next.rows - previous.rows) / 2);

      gl.useProgram(this.#blit.program);
      gl.uniform1ui(this.#blit.at('uCols'), next.cols);
      gl.uniform1ui(this.#blit.at('uSrcCols'), previous.cols);
      gl.uniform1ui(this.#blit.at('uSrcRows'), previous.rows);
      gl.uniform1i(this.#blit.at('uDx'), dx);
      gl.uniform1i(this.#blit.at('uDy'), dy);

      this.#bind(0, pick(previous.state, this.#front), this.#blit.at('uSrc'));
      this.#draw(next.stateFbo[0], wordsPerRow, next.rows);
      this.#bind(0, previous.seed, this.#blit.at('uSrc'));
      this.#draw(next.seedFbo, wordsPerRow, next.rows);

      this.#destroyGrid(previous);
    }

    this.#grid = next;
    this.#front = 0;
    this.#maskFront = 0;
    this.#cellPx = spec.cellPx;
  }

  setRule(rule: RuleSpec): void {
    this.#rule = rule;
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

  render(): void {
    const gl = this.#gl;
    const [r, g, b, a] = BACKGROUND;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.#width, this.#height);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const grid = this.#grid;
    if (!grid) return;

    gl.useProgram(this.#present.program);
    gl.uniform1ui(this.#present.at('uCols'), grid.cols);
    gl.uniform1ui(this.#present.at('uRows'), grid.rows);
    gl.uniform1f(this.#present.at('uCellPx'), this.#cellPx);
    gl.uniform1f(this.#present.at('uHeight'), this.#height);
    gl.uniform4fv(this.#present.at('uAlive'), ALIVE);
    gl.uniform4fv(this.#present.at('uDead'), BACKGROUND);
    this.#bind(0, pick(grid.state, this.#front), this.#present.at('uState'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  beginStroke(): void {
    const grid = this.#grid;
    if (!grid) return;

    const gl = this.#gl;
    gl.useProgram(this.#copy.program);
    this.#bind(0, pick(grid.state, this.#front), this.#copy.at('uSrc'));
    this.#draw(grid.baseFbo, grid.wordsPerRow, grid.rows);

    for (const fbo of grid.maskFbo) this.#clearTarget(fbo);
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
    this.#clearTarget(pick(grid.stateFbo, this.#front));
  }

  dispose(): void {
    if (this.#grid) this.#destroyGrid(this.#grid);
    this.#grid = null;
    this.#gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  #createGrid(cols: number, rows: number, wordsPerRow: number): Grid {
    const gl = this.#gl;
    const texture = () => createTexture(gl, wordsPerRow, rows);

    const state: [WebGLTexture, WebGLTexture] = [texture(), texture()];
    const mask: [WebGLTexture, WebGLTexture] = [texture(), texture()];
    const seed = texture();
    const base = texture();

    const grid: Grid = {
      cols,
      rows,
      wordsPerRow,
      state,
      mask,
      seed,
      base,
      stateFbo: [createFbo(gl, [state[0]]), createFbo(gl, [state[1]])],
      maskFbo: [createFbo(gl, [mask[0]]), createFbo(gl, [mask[1]])],
      seedFbo: createFbo(gl, [seed]),
      baseFbo: createFbo(gl, [base]),
      stampFbo: [
        [createFbo(gl, [mask[0], state[0]]), createFbo(gl, [mask[0], state[1]])],
        [createFbo(gl, [mask[1], state[0]]), createFbo(gl, [mask[1], state[1]])],
      ],
    };

    for (const fbo of [...grid.stateFbo, ...grid.maskFbo, grid.seedFbo, grid.baseFbo]) {
      this.#clearTarget(fbo);
    }

    return grid;
  }

  #destroyGrid(grid: Grid): void {
    const gl = this.#gl;
    for (const texture of [...grid.state, ...grid.mask, grid.seed, grid.base]) {
      gl.deleteTexture(texture);
    }
    for (const fbo of [
      ...grid.stateFbo,
      ...grid.maskFbo,
      grid.seedFbo,
      grid.baseFbo,
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

  #clearTarget(fbo: WebGLFramebuffer): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));
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

function createTexture(gl: WebGL2RenderingContext, width: number, height: number): WebGLTexture {
  const texture = must(gl.createTexture(), 'texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32UI, Math.max(1, width), Math.max(1, height));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
