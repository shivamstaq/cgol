// Centre-anchored cell-level copy between grids of different dimensions.

struct Blit {
  cols: u32,
  rows: u32,
  wordsPerRow: u32,
  srcCols: u32,
  srcRows: u32,
  srcWordsPerRow: u32,
  dx: i32,
  dy: i32,
};

@group(0) @binding(0) var<uniform> blit: Blit;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;

@compute @workgroup_size(8, 8)
fn copy(@builtin(global_invocation_id) id: vec3<u32>) {
  let wx = id.x;
  let y = id.y;
  if (wx >= blit.wordsPerRow || y >= blit.rows) {
    return;
  }

  var out: u32 = 0u;
  let srcY = i32(y) - blit.dy;

  if (srcY >= 0 && srcY < i32(blit.srcRows)) {
    let firstX = wx * 32u;
    let wordBits = min(32u, blit.cols - firstX);
    for (var i: u32 = 0u; i < wordBits; i = i + 1u) {
      let srcX = i32(firstX + i) - blit.dx;
      if (srcX >= 0 && srcX < i32(blit.srcCols)) {
        let word = src[u32(srcY) * blit.srcWordsPerRow + u32(srcX) / 32u];
        out |= ((word >> (u32(srcX) % 32u)) & 1u) << i;
      }
    }
  }

  dst[y * blit.wordsPerRow + wx] = out;
}
