import { create } from 'zustand';
import { CELL_SIZE_DEFAULT, CELL_SIZE_MAX, CELL_SIZE_MIN } from '../engine/defaults';
import type { BackendKind, EngineStats } from '../engine/protocol';

interface AppState {
  cellSize: number;
  backend: BackendKind | null;
  device: string;
  stats: EngineStats | null;
  fatal: string | null;

  setCellSize: (value: number) => void;
  setReady: (backend: BackendKind, device: string) => void;
  setStats: (stats: EngineStats) => void;
  setFatal: (message: string) => void;
}

export const useStore = create<AppState>()((set) => ({
  cellSize: CELL_SIZE_DEFAULT,
  backend: null,
  device: '',
  stats: null,
  fatal: null,

  setCellSize: (value) =>
    set({ cellSize: Math.min(CELL_SIZE_MAX, Math.max(CELL_SIZE_MIN, Math.round(value))) }),
  setReady: (backend, device) => set({ backend, device, fatal: null }),
  setStats: (stats) => set({ stats }),
  setFatal: (message) => set({ fatal: message }),
}));
