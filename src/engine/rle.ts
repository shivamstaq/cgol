export interface Pattern {
  width: number;
  height: number;
  /** Row-major, 1 = alive. */
  cells: Uint8Array;
}

const HEADER = /^\s*x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)/i;

export function parseRle(text: string): Pattern | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const headerIndex = lines.findIndex((line) => HEADER.test(line));
  if (headerIndex < 0) return null;

  const header = HEADER.exec(lines[headerIndex] ?? '');
  const width = Number(header?.[1] ?? 0);
  const height = Number(header?.[2] ?? 0);
  if (width <= 0 || height <= 0 || width * height > 4_000_000) return null;

  const body = lines.slice(headerIndex + 1).join('');
  const cells = new Uint8Array(width * height);

  let x = 0;
  let y = 0;
  let count = 0;

  for (const character of body) {
    if (character >= '0' && character <= '9') {
      count = count * 10 + Number(character);
      continue;
    }

    const run = count || 1;
    count = 0;

    if (character === '!') break;

    if (character === '$') {
      y += run;
      x = 0;
      continue;
    }

    if (character === 'b' || character === 'o') {
      if (character === 'o') {
        for (let i = 0; i < run && x + i < width; i += 1) {
          if (y < height) cells[y * width + x + i] = 1;
        }
      }
      x += run;
    }
  }

  return { width, height, cells };
}

export function toRle(pattern: Pattern, rule = 'B3/S23'): string {
  const rows: string[] = [];

  for (let y = 0; y < pattern.height; y += 1) {
    const tokens: string[] = [];
    let run = 0;
    let symbol: 'b' | 'o' = 'b';

    const flush = () => {
      if (run === 0) return;
      tokens.push(run === 1 ? symbol : `${run}${symbol}`);
      run = 0;
    };

    for (let x = 0; x < pattern.width; x += 1) {
      const next = pattern.cells[y * pattern.width + x] === 1 ? 'o' : 'b';
      if (next === symbol) {
        run += 1;
      } else {
        flush();
        symbol = next;
        run = 1;
      }
    }

    // A trailing dead run is implied by the row break.
    if (symbol === 'o') flush();
    rows.push(tokens.join(''));
  }

  while (rows.length > 0 && rows.at(-1) === '') rows.pop();

  return `x = ${pattern.width}, y = ${pattern.height}, rule = ${rule}\n${wrap(`${rows.join('$')}!`)}`;
}

export function rotate(pattern: Pattern): Pattern {
  const cells = new Uint8Array(pattern.cells.length);
  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      const value = pattern.cells[y * pattern.width + x] ?? 0;
      cells[x * pattern.height + (pattern.height - 1 - y)] = value;
    }
  }
  return { width: pattern.height, height: pattern.width, cells };
}

export function flip(pattern: Pattern): Pattern {
  const cells = new Uint8Array(pattern.cells.length);
  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      cells[y * pattern.width + (pattern.width - 1 - x)] =
        pattern.cells[y * pattern.width + x] ?? 0;
    }
  }
  return { width: pattern.width, height: pattern.height, cells };
}

function wrap(body: string, width = 70): string {
  const lines: string[] = [];
  for (let index = 0; index < body.length; index += width) {
    lines.push(body.slice(index, index + width));
  }
  return lines.join('\n');
}
