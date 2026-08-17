import { create } from 'zustand';
import { send } from '../engine/bridge';
import {
  BRUSH_SCATTER_DEFAULT,
  BRUSH_SIZE_DEFAULT,
  BRUSH_SIZE_MAX,
  BRUSH_SIZE_MIN,
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
import { parseRule } from '../engine/rules';
import { loadSettings, saveSettings, type DockPosition } from './persist';

export type PanelName = 'brush' | 'presets' | 'rules' | 'look' | 'telemetry' | 'shortcuts';

export interface ArmedPattern {
  name: string;
  rle: string;
}

interface AppState {
  mode: Mode;
  cellSize: number;
  speed: SpeedSpec;
  brush: BrushSpec;
  visuals: VisualSpec;
  rule: string;

  dock: DockPosition | null;
  dockHidden: boolean;
  panel: PanelName | null;
  armed: ArmedPattern | null;

  backend: BackendKind | null;
  device: string;
  simulates: boolean;
  stats: EngineStats | null;
  fatal: string | null;

  setMode: (mode: Mode) => void;
  syncMode: (mode: Mode) => void;
  setCellSize: (value: number) => void;
  setSpeed: (speed: SpeedSpec) => void;
  setBrush: (brush: Partial<BrushSpec>) => void;
  setVisuals: (visuals: Partial<VisualSpec>) => void;
  setRule: (notation: string) => boolean;

  setDock: (dock: DockPosition) => void;
  toggleDock: () => void;
  setPanel: (panel: PanelName | null) => void;
  setArmed: (armed: ArmedPattern | null) => void;

  setReady: (backend: BackendKind, device: string, simulates: boolean) => void;
  setStats: (stats: EngineStats) => void;
  setFatal: (message: string) => void;
}

const stored = loadSettings();

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

export const useStore = create<AppState>()((set, get) => {
  const persist = () => {
    const state = get();
    saveSettings({
      cellSize: state.cellSize,
      speed: state.speed,
      brush: state.brush,
      visuals: state.visuals,
      rule: state.rule,
      dock: state.dock,
    });
  };

  return {
    mode: 'drawing',
    cellSize: stored?.cellSize ?? CELL_SIZE_DEFAULT,
    speed: stored?.speed ?? { generationsPerSecond: SPEED_DEFAULT, turbo: false },
    brush: stored?.brush ?? {
      size: BRUSH_SIZE_DEFAULT,
      shape: 'circle',
      scatter: BRUSH_SCATTER_DEFAULT,
    },
    visuals: stored?.visuals ?? { palette: 'aurora', glow: 'subtle', gridLines: true },
    rule: stored?.rule ?? 'B3/S23',

    dock: stored?.dock ?? null,
    dockHidden: false,
    panel: null,
    armed: null,

    backend: null,
    device: '',
    simulates: false,
    stats: null,
    fatal: null,

    setMode: (mode) => {
      send({ type: 'mode', mode });
      set({ mode });
    },
    syncMode: (mode) => set({ mode }),

    setCellSize: (value) => {
      set({ cellSize: clamp(value, CELL_SIZE_MIN, CELL_SIZE_MAX) });
      persist();
    },

    setSpeed: (speed) => {
      send({ type: 'speed', speed });
      set({ speed });
      persist();
    },

    setBrush: (partial) => {
      const brush = { ...get().brush, ...partial };
      brush.size = clamp(brush.size, BRUSH_SIZE_MIN, BRUSH_SIZE_MAX);
      send({ type: 'brush', brush });
      set({ brush });
      persist();
    },

    setVisuals: (partial) => {
      const visuals = { ...get().visuals, ...partial };
      send({ type: 'visuals', visuals });
      set({ visuals });
      persist();
    },

    setRule: (notation) => {
      const rule = parseRule(notation);
      if (!rule) return false;

      send({ type: 'rule', rule });
      set({ rule: notation.toUpperCase() });
      persist();
      return true;
    },

    setDock: (dock) => {
      set({ dock });
      persist();
    },
    toggleDock: () => set({ dockHidden: !get().dockHidden }),
    setPanel: (panel) => set({ panel }),
    setArmed: (armed) => set({ armed, panel: armed ? null : get().panel }),

    setReady: (backend, device, simulates) => set({ backend, device, simulates, fatal: null }),
    setStats: (stats) => set({ stats }),
    setFatal: (message) => set({ fatal: message }),
  };
});
