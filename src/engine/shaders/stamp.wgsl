// XOR stroke stamp: accumulates capsule coverage into a stroke mask, then
// rewrites state as base ^ mask so each cell flips at most once per stroke.

struct Stamp {
  cols: u32,
  rows: u32,
  wordsPerRow: u32,
  shape: u32,
  p0: vec2<f32>,
  p1: vec2<f32>,
  radius: f32,
  scatter: f32,
  seed: u32,
  originWord: u32,
  originRow: u32,
};

@group(0) @binding(0) var<uniform> stamp: Stamp;
@group(0) @binding(1) var<storage, read> base: array<u32>;
@group(0) @binding(2) var<storage, read_write> mask: array<u32>;
@group(0) @binding(3) var<storage, read_write> state: array<u32>;

fn pcg(value: u32) -> u32 {
  let mixed = value * 747796405u + 2891336453u;
  let word = ((mixed >> ((mixed >> 28u) + 4u)) ^ mixed) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand01(x: u32, y: u32) -> f32 {
  return f32(pcg(x * 1973u + y * 9277u + stamp.seed * 26699u)) / 4294967295.0;
}

fn covered(point: vec2<f32>) -> bool {
  let span = stamp.p1 - stamp.p0;
  let t = clamp(dot(point - stamp.p0, span) / max(dot(span, span), 1e-6), 0.0, 1.0);
  let delta = point - (stamp.p0 + span * t);
  if (stamp.shape == 1u) {
    return max(abs(delta.x), abs(delta.y)) <= stamp.radius;
  }
  return length(delta) <= stamp.radius;
}

@compute @workgroup_size(8, 8)
fn apply(@builtin(global_invocation_id) id: vec3<u32>) {
  let wx = stamp.originWord + id.x;
  let y = stamp.originRow + id.y;
  if (wx >= stamp.wordsPerRow || y >= stamp.rows) {
    return;
  }

  let index = y * stamp.wordsPerRow + wx;
  let firstX = wx * 32u;
  let wordBits = min(32u, stamp.cols - firstX);
  var bits = mask[index];

  for (var i: u32 = 0u; i < wordBits; i = i + 1u) {
    let x = firstX + i;
    let point = vec2<f32>(f32(x) + 0.5, f32(y) + 0.5);
    if (covered(point) && (stamp.scatter >= 1.0 || rand01(x, y) < stamp.scatter)) {
      bits |= 1u << i;
    }
  }

  mask[index] = bits;
  state[index] = base[index] ^ bits;
}
