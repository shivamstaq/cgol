// Birth and death intensities per cell, decayed in wall-clock time.
// Packed as two 16-bit fixed-point values per u32: birth low, death high.

struct Params {
  cols: u32,
  rows: u32,
  wordsPerRow: u32,
  stepped: u32,
  birthDecay: f32,
  deathDecay: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> current: array<u32>;
@group(0) @binding(2) var<storage, read> previous: array<u32>;
@group(0) @binding(3) var<storage, read_write> fx: array<u32>;

fn unpackFx(value: u32) -> vec2<f32> {
  return vec2<f32>(f32(value & 0xFFFFu), f32(value >> 16u)) / 65535.0;
}

fn packFx(value: vec2<f32>) -> u32 {
  let quantised = vec2<u32>(clamp(value, vec2<f32>(0.0), vec2<f32>(1.0)) * 65535.0 + 0.5);
  return quantised.x | (quantised.y << 16u);
}

@compute @workgroup_size(8, 8)
fn update(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.cols || id.y >= params.rows) {
    return;
  }

  let index = id.y * params.cols + id.x;
  var events = unpackFx(fx[index]);
  events.x = max(events.x - params.birthDecay, 0.0);
  events.y = max(events.y - params.deathDecay, 0.0);

  if (params.stepped == 1u) {
    let word = id.y * params.wordsPerRow + id.x / 32u;
    let bit = id.x % 32u;
    let now = (current[word] >> bit) & 1u;
    let before = (previous[word] >> bit) & 1u;

    if (now == 1u && before == 0u) {
      events.x = 1.0;
      events.y = 0.0;
    } else if (now == 0u && before == 1u) {
      events.y = 1.0;
      events.x = 0.0;
    }
  }

  fx[index] = packFx(events);
}
