export type Rgba = readonly [number, number, number, number];
export type PaletteName = 'aurora' | 'ember' | 'ultraviolet' | 'mono';

export interface Palette {
  bg: Rgba;
  alive: Rgba;
  birth: Rgba;
  death: Rgba;
}

const rgb = (hex: number): Rgba => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
  1,
];

export const PALETTES: Record<PaletteName, Palette> = {
  aurora: {
    bg: rgb(0x05070a),
    alive: rgb(0x7ff3ff),
    birth: rgb(0xffffff),
    death: rgb(0xffb46b),
  },
  ember: {
    bg: rgb(0x0a0604),
    alive: rgb(0xffb347),
    birth: rgb(0xfff2d0),
    death: rgb(0xff5a3c),
  },
  ultraviolet: {
    bg: rgb(0x08050f),
    alive: rgb(0xc77dff),
    birth: rgb(0xffffff),
    death: rgb(0xff5fa2),
  },
  mono: {
    bg: rgb(0x060606),
    alive: rgb(0xf2f2f2),
    birth: rgb(0xffffff),
    death: rgb(0x8a8a8a),
  },
};

export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];

function channel(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}

export function toCss(color: Rgba): string {
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

/** Linear blend toward white. */
export function lighten(color: Rgba, amount: number): Rgba {
  return [
    color[0] + (1 - color[0]) * amount,
    color[1] + (1 - color[1]) * amount,
    color[2] + (1 - color[2]) * amount,
    color[3],
  ];
}
