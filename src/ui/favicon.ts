import { PALETTES, toCss, type PaletteName } from '../engine/palette';
import type { Mode } from '../engine/protocol';

/** Blinker phases on a 3×3 grid: the smallest oscillator in Life. */
const PHASES: readonly number[][] = [
  [1, 4, 7],
  [3, 4, 5],
];

const FRAME_MS = 420;

let link: HTMLLinkElement | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let phase = 0;

export function syncFavicon(mode: Mode, palette: PaletteName): void {
  clearInterval(timer);
  timer = undefined;

  if (mode !== 'running') {
    phase = 0;
    paint(mode, palette);
    return;
  }

  paint(mode, palette);
  timer = setInterval(() => {
    phase = (phase + 1) % PHASES.length;
    paint(mode, palette);
  }, FRAME_MS);
}

function paint(mode: Mode, palette: PaletteName): void {
  link ??= ensureLink();
  link.href = `data:image/svg+xml,${encodeURIComponent(render(mode, palette))}`;
}

function render(mode: Mode, palette: PaletteName): string {
  const colours = PALETTES[palette];
  const alive = toCss(colours.alive);
  const live = new Set(PHASES[phase] ?? []);
  const dim = mode === 'running' ? 0.22 : 0.16;

  const cells = Array.from({ length: 9 }, (_, index) => {
    const x = 1 + (index % 3) * 5;
    const y = 1 + Math.floor(index / 3) * 5;
    const on = live.has(index);

    return `<rect x="${x}" y="${y}" width="4" height="4" rx="1" fill="${alive}" fill-opacity="${
      on ? (mode === 'running' ? 1 : 0.75) : dim
    }"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${toCss(
    colours.bg,
  )}"/>${cells}</svg>`;
}

function ensureLink(): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (existing) return existing;

  const created = document.createElement('link');
  created.rel = 'icon';
  document.head.append(created);

  return created;
}
