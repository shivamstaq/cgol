import type { Pattern } from './rle';

export interface GridDims {
  cols: number;
  rows: number;
  wordsPerRow: number;
}

export type FillKind = 'random' | 'symmetric' | 'blob';

const wrap = (value: number, limit: number) => ((value % limit) + limit) % limit;

export function orPattern(
  words: Uint32Array,
  dims: GridDims,
  pattern: Pattern,
  originX: number,
  originY: number,
): void {
  for (let y = 0; y < pattern.height; y += 1) {
    const row = wrap(originY + y, dims.rows) * dims.wordsPerRow;
    for (let x = 0; x < pattern.width; x += 1) {
      if (pattern.cells[y * pattern.width + x] !== 1) continue;
      const column = wrap(originX + x, dims.cols);
      const index = row + (column >>> 5);
      words[index] = (words[index] ?? 0) | (1 << (column & 31));
    }
  }
}

/** Live cells cropped to their bounding box. */
export function toPattern(words: Uint32Array, dims: GridDims): Pattern {
  let minX = dims.cols;
  let minY = dims.rows;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < dims.rows; y += 1) {
    for (let wordIndex = 0; wordIndex < dims.wordsPerRow; wordIndex += 1) {
      const word = words[y * dims.wordsPerRow + wordIndex] ?? 0;
      if (word === 0) continue;

      for (let bit = 0; bit < 32; bit += 1) {
        if (((word >>> bit) & 1) === 0) continue;
        const x = wordIndex * 32 + bit;
        if (x >= dims.cols) break;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return { width: 0, height: 0, cells: new Uint8Array(0) };

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cells = new Uint8Array(width * height);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const word = words[y * dims.wordsPerRow + (x >>> 5)] ?? 0;
      if ((word >>> (x & 31)) & 1) cells[(y - minY) * width + (x - minX)] = 1;
    }
  }

  return { width, height, cells };
}

export function countLive(words: Uint32Array): number {
  let total = 0;
  for (const word of words) {
    let value = word - ((word >>> 1) & 0x5555_5555);
    value = (value & 0x3333_3333) + ((value >>> 2) & 0x3333_3333);
    value = (value + (value >>> 4)) & 0x0f0f_0f0f;
    total += Math.imul(value, 0x0101_0101) >>> 24;
  }
  return total;
}

export function fillWords(dims: GridDims, kind: FillKind, density: number): Uint32Array {
  const words = new Uint32Array(dims.wordsPerRow * dims.rows);

  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= dims.cols || y >= dims.rows) return;
    const index = y * dims.wordsPerRow + (x >>> 5);
    words[index] = (words[index] ?? 0) | (1 << (x & 31));
  };

  if (kind === 'symmetric') {
    const halfX = Math.ceil(dims.cols / 2);
    const halfY = Math.ceil(dims.rows / 2);
    for (let y = 0; y < halfY; y += 1) {
      for (let x = 0; x < halfX; x += 1) {
        if (Math.random() >= density) continue;
        set(x, y);
        set(dims.cols - 1 - x, y);
        set(x, dims.rows - 1 - y);
        set(dims.cols - 1 - x, dims.rows - 1 - y);
      }
    }
    return words;
  }

  if (kind === 'blob') {
    const centreX = dims.cols / 2;
    const centreY = dims.rows / 2;
    const radiusX = dims.cols / 5;
    const radiusY = dims.rows / 5;
    for (let y = 0; y < dims.rows; y += 1) {
      for (let x = 0; x < dims.cols; x += 1) {
        const dx = (x - centreX) / radiusX;
        const dy = (y - centreY) / radiusY;
        if (dx * dx + dy * dy <= 1 && Math.random() < density) set(x, y);
      }
    }
    return words;
  }

  for (let y = 0; y < dims.rows; y += 1) {
    for (let x = 0; x < dims.cols; x += 1) {
      if (Math.random() < density) set(x, y);
    }
  }

  return words;
}
