import { lighten, PALETTES, toCss, type PaletteName } from '../engine/palette';

/** Mirrors the active palette onto the Tailwind theme tokens. */
export function applyPalette(name: PaletteName): void {
  const palette = PALETTES[name];
  const root = document.documentElement.style;

  root.setProperty('--color-bg', toCss(palette.bg));
  root.setProperty('--color-alive', toCss(palette.alive));
  root.setProperty('--color-birth', toCss(palette.birth));
  root.setProperty('--color-death', toCss(palette.death));
  root.setProperty('--color-surface', toCss(lighten(palette.bg, 0.06)));
  root.setProperty('--color-border', toCss(lighten(palette.bg, 0.16)));
}
