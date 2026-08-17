import type { BrushSpec, SpeedSpec, VisualSpec } from '../engine/protocol';

const SETTINGS_KEY = 'cgol:settings';
const BOARD_KEY = 'cgol:board';

export interface DockPosition {
  x: number;
  y: number;
}

export interface Settings {
  cellSize: number;
  speed: SpeedSpec;
  brush: BrushSpec;
  visuals: VisualSpec;
  rule: string;
  dock: DockPosition | null;
}

export function loadSettings(): Partial<Settings> | null {
  return read(SETTINGS_KEY) as Partial<Settings> | null;
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function loadBoard(): string | null {
  const value = read(BOARD_KEY);
  return typeof value === 'string' ? value : null;
}

export function saveBoard(rle: string): void {
  if (rle.length === 0) {
    localStorage.removeItem(BOARD_KEY);
    return;
  }
  write(BOARD_KEY, rle);
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full; settings are not critical.
  }
}
