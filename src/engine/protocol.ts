import type { FillKind } from './pack';
import type { PaletteName } from './palette';

export type BackendKind = 'webgpu' | 'webgl2';
export type GlowLevel = 'off' | 'subtle' | 'full';
export type Mode = 'drawing' | 'running';
export type BrushShape = 'circle' | 'square';

export interface ViewportSpec {
  /** CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** Clamped to MAX_DPR. */
  dpr: number;
  /** CSS pixels per cell. */
  cellSize: number;
}

export interface BrushSpec {
  /** Diameter in cells. */
  size: number;
  shape: BrushShape;
  /** Fraction of covered cells flipped, 0..1. */
  scatter: number;
}

export interface SpeedSpec {
  generationsPerSecond: number;
  turbo: boolean;
}

export interface VisualSpec {
  palette: PaletteName;
  glow: GlowLevel;
  gridLines: boolean;
}

export interface RuleSpec {
  birth: number;
  survive: number;
}

/** CSS pixels relative to the canvas origin. */
export interface Point {
  x: number;
  y: number;
}

export interface EngineStats {
  fps: number;
  frameMs: number;
  cols: number;
  rows: number;
  cells: number;
  generation: number;
  generationsPerSecond: number;
  population: number;
}

export type MainToEngine =
  | { type: 'init'; canvas: OffscreenCanvas; viewport: ViewportSpec; preferred: BackendKind | null }
  | { type: 'viewport'; viewport: ViewportSpec }
  | { type: 'mode'; mode: Mode }
  | { type: 'speed'; speed: SpeedSpec }
  | { type: 'brush'; brush: BrushSpec }
  | { type: 'rule'; rule: RuleSpec }
  | { type: 'visuals'; visuals: VisualSpec }
  | { type: 'strokeStart'; point: Point }
  | { type: 'strokeMove'; points: Point[] }
  | { type: 'strokeEnd' }
  | { type: 'stampPattern'; rle: string; point: Point }
  | { type: 'fill'; kind: FillKind; density: number }
  | { type: 'requestRle' }
  | { type: 'requestPng' }
  | { type: 'loadRle'; rle: string }
  | { type: 'step' }
  | { type: 'reset' }
  | { type: 'clear' }
  | { type: 'dispose' };

export type EngineToMain =
  | { type: 'ready'; backend: BackendKind; device: string; simulates: boolean }
  | { type: 'mode'; mode: Mode }
  | { type: 'stats'; stats: EngineStats }
  | { type: 'rle'; rle: string }
  | { type: 'png'; blob: Blob }
  | { type: 'fatal'; message: string };
