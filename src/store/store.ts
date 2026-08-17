import { create } from 'zustand';
import {
  BRUSH_SCATTER_DEFAULT,
  BRUSH_SIZE_DEFAULT,
  CELL_SIZE_DEFAULT,
  CELL_SIZE_MAX,
  CELL_SIZE_MIN,
  SPEED_DEFAULT,
} from '../engine/defaults';
import type {
  BackendKind,
  BrushSpec,
  EngineStats,
  Mode,
  SpeedSpec,
  VisualSpec,
} from '../engine/protocol';

interface AppState {
  mode: Mode;
  cellSize: number;
  speed: SpeedSpec;
  brush: BrushSpec;
  visuals: VisualSpec;

  backend: BackendKind | null;
  device: string;
  simulates: boolean;
  stats: EngineStats | null;
  fatal: string | null;

  setMode: (mode: Mode) => void;
  setCellSize: (value: number) => void;
  setSpeed: (speed: SpeedSpec) => void;
  setBrush: (brush: BrushSpec) => void;
  setVisuals: (visuals: VisualSpec) => void;
  setReady: (backend: BackendKind, device: string, simulates: boolean) => void;
  setStats: (stats: EngineStats) => void;
  setFatal: (message: string) => void;
}

export const useStore = create<AppState>()((set) => ({
  mode: 'drawing',
  cellSize: CELL_SIZE_DEFAULT,
  speed: { generationsPerSecond: SPEED_DEFAULT, turbo: false },
  brush: { size: BRUSH_SIZE_DEFAULT, shape: 'circle', scatter: BRUSH_SCATTER_DEFAULT },
  visuals: { palette: 'aurora', glow: 'subtle', gridLines: true },

  backend: null,
  device: '',
  simulates: false,
  stats: null,
  fatal: null,

  setMode: (mode) => set({ mode }),
  setCellSize: (value) =>
    set({ cellSize: Math.min(CELL_SIZE_MAX, Math.max(CELL_SIZE_MIN, Math.round(value))) }),
  setSpeed: (speed) => set({ speed }),
  setBrush: (brush) => set({ brush }),
  setVisuals: (visuals) => set({ visuals }),
  setReady: (backend, device, simulates) => set({ backend, device, simulates, fatal: null }),
  setStats: (stats) => set({ stats }),
  setFatal: (message) => set({ fatal: message }),
}));
