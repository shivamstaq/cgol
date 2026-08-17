// One texel per cell; feeds the glow mip chain.

struct Params {
  cols: u32,
  rows: u32,
  wordsPerRow: u32,
  pad: u32,
  alive: vec4<f32>,
  birth: vec4<f32>,
  death: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> state: array<u32>;
@group(0) @binding(2) var<storage, read> fx: array<u32>;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  var corners = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  return vec4<f32>(corners[index], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let cell = vec2<u32>(position.xy);
  if (cell.x >= params.cols || cell.y >= params.rows) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  let word = state[cell.y * params.wordsPerRow + cell.x / 32u];
  let alive = ((word >> (cell.x % 32u)) & 1u) == 1u;

  let packed = fx[cell.y * params.cols + cell.x];
  let events = vec2<f32>(f32(packed & 0xFFFFu), f32(packed >> 16u)) / 65535.0;

  var colour = vec3<f32>(0.0);
  if (alive) {
    let settled = smoothstep(0.0, 1.0, 1.0 - events.x);
    colour = mix(params.birth.rgb, params.alive.rgb, settled) * mix(1.8, 1.0, settled);
  } else if (events.y > 0.0) {
    colour = params.death.rgb * events.y;
  }

  return vec4<f32>(colour, 1.0);
}
