export type BackendKind = 'webgpu' | 'webgl2';

export interface ViewportSpec {
  /** CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** Clamped to MAX_DPR. */
  dpr: number;
  /** CSS pixels per cell. */
  cellSize: number;
}

export interface EngineStats {
  fps: number;
  frameMs: number;
  cols: number;
  rows: number;
  cells: number;
}

export type MainToEngine =
  | { type: 'init'; canvas: OffscreenCanvas; viewport: ViewportSpec; preferred: BackendKind | null }
  | { type: 'viewport'; viewport: ViewportSpec }
  | { type: 'dispose' };

export type EngineToMain =
  | { type: 'ready'; backend: BackendKind; device: string }
  | { type: 'stats'; stats: EngineStats }
  | { type: 'fatal'; message: string };
