// Bit-packed Life step. One invocation evolves one u32 = 32 cells.
// Bit i of word w holds cell x = w * 32 + i. Rows wrap; columns wrap modulo cols.

struct Grid {
  cols: u32,
  rows: u32,
  wordsPerRow: u32,
  birth: u32,
  survive: u32,
};

struct Triple {
  l: u32,
  c: u32,
  r: u32,
};

@group(0) @binding(0) var<uniform> grid: Grid;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;

fn bitAt(row: u32, x: i32) -> u32 {
  let cols = i32(grid.cols);
  let wrapped = u32(((x % cols) + cols) % cols);
  let word = src[row * grid.wordsPerRow + wrapped / 32u];
  return (word >> (wrapped % 32u)) & 1u;
}

/** Sum of three bit planes: .x = weight 1, .y = weight 2. */
fn sum3(a: u32, b: u32, c: u32) -> vec2<u32> {
  let ab = a ^ b;
  return vec2<u32>(ab ^ c, (a & b) | (ab & c));
}

fn triple(row: u32, wx: u32, firstX: i32, wordBits: u32) -> Triple {
  let c = src[row * grid.wordsPerRow + wx];
  let lIn = bitAt(row, firstX - 1);
  let rIn = bitAt(row, firstX + i32(wordBits));
  return Triple((c << 1u) | lIn, c, (c >> 1u) | (rIn << (wordBits - 1u)));
}

@compute @workgroup_size(8, 8)
fn step(@builtin(global_invocation_id) id: vec3<u32>) {
  let wx = id.x;
  let y = id.y;
  if (wx >= grid.wordsPerRow || y >= grid.rows) {
    return;
  }

  let firstX = i32(wx * 32u);
  let wordBits = min(32u, grid.cols - wx * 32u);

  let up = triple((y + grid.rows - 1u) % grid.rows, wx, firstX, wordBits);
  let mid = triple(y, wx, firstX, wordBits);
  let dn = triple((y + 1u) % grid.rows, wx, firstX, wordBits);

  let a = sum3(up.l, up.c, up.r);
  let b = sum3(dn.l, dn.c, dn.r);
  let m = vec2<u32>(mid.l ^ mid.r, mid.l & mid.r);

  let ones = sum3(a.x, b.x, m.x);
  let twos = sum3(a.y, b.y, m.y);

  let b0 = ones.x;
  let b1 = twos.x ^ ones.y;
  let carry4 = twos.x & ones.y;
  let b2 = twos.y ^ carry4;
  let b3 = twos.y & carry4;

  var born: u32 = 0u;
  var surv: u32 = 0u;
  for (var k: u32 = 0u; k < 9u; k = k + 1u) {
    let eq =
      select(~b0, b0, (k & 1u) != 0u) &
      select(~b1, b1, (k & 2u) != 0u) &
      select(~b2, b2, (k & 4u) != 0u) &
      select(~b3, b3, (k & 8u) != 0u);
    born |= eq & (0u - ((grid.birth >> k) & 1u));
    surv |= eq & (0u - ((grid.survive >> k) & 1u));
  }

  let tail = select((1u << wordBits) - 1u, 0xFFFFFFFFu, wordBits == 32u);
  dst[y * grid.wordsPerRow + wx] = ((~mid.c & born) | (mid.c & surv)) & tail;
}
