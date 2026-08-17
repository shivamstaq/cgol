import type { Palette } from '../palette';
import type { BackendKind, RuleSpec } from '../protocol';

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface GridSpec {
  cols: number;
  rows: number;
  /** Device pixels per cell. */
  cellPx: number;
}

export interface StampSpec {
  /** Segment endpoints in cell space. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Cells. */
  radius: number;
  shape: 0 | 1;
  scatter: number;
  seed: number;
}

export interface ResolvedVisuals {
  palette: Palette;
  /** Glow strength, 0 disables the emissive chain. */
  glow: number;
  gridLines: boolean;
}

export interface Backend {
  readonly kind: BackendKind;
  readonly device: string;
  readonly simulates: boolean;

  /** Device pixels. */
  resizeSurface(width: number, height: number): void;
  allocate(grid: GridSpec): void;
  setRule(rule: RuleSpec): void;
  setVisuals(visuals: ResolvedVisuals): void;

  advance(steps: number): void;
  render(deltaMs: number, stepped: boolean): void;

  beginStroke(): void;
  stamp(spec: StampSpec): void;

  snapshotSeed(): void;
  restoreSeed(): void;
  clear(): void;

  dispose(): void;
}

function isOffscreen(canvas: RenderCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

export function getWebGPUContext(canvas: RenderCanvas): GPUCanvasContext | null {
  return isOffscreen(canvas) ? canvas.getContext('webgpu') : canvas.getContext('webgpu');
}

export function getWebGL2Context(
  canvas: RenderCanvas,
  attributes: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  return isOffscreen(canvas)
    ? canvas.getContext('webgl2', attributes)
    : canvas.getContext('webgl2', attributes);
}
