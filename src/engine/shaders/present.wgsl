struct View {
  cols: u32,
  rows: u32,
  wordsPerRow: u32,
  cellPx: f32,
  alive: vec4<f32>,
  dead: vec4<f32>,
  birth: vec4<f32>,
  death: vec4<f32>,
  glow: f32,
  grid: f32,
  geometry: f32,
  shrink: f32,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> state: array<u32>;
@group(0) @binding(2) var<storage, read> fx: array<u32>;
@group(0) @binding(3) var emissive: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  var corners = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  return vec4<f32>(corners[index], 0.0, 1.0);
}

/** Signed distance to a rounded square, cell units. */
fn boxDistance(local: vec2<f32>, half: f32, radius: f32) -> f32 {
  let outer = abs(local) - vec2<f32>(max(half - radius, 0.0));
  return length(max(outer, vec2<f32>(0.0))) + min(max(outer.x, outer.y), 0.0) - radius;
}

@fragment
fn fs(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let gridPoint = position.xy / view.cellPx;
  let cell = vec2<u32>(floor(gridPoint));
  var colour = view.dead.rgb;

  if (cell.x < view.cols && cell.y < view.rows) {
    let local = fract(gridPoint) - vec2<f32>(0.5);
    let word = state[cell.y * view.wordsPerRow + cell.x / 32u];
    let alive = ((word >> (cell.x % 32u)) & 1u) == 1u;

    let packed = fx[cell.y * view.cols + cell.x];
    let events = vec2<f32>(f32(packed & 0xFFFFu), f32(packed >> 16u)) / 65535.0;

    var tint = view.dead.rgb;
    var scale = 0.0;
    var intensity = 0.0;

    if (alive) {
      let settled = smoothstep(0.0, 1.0, 1.0 - events.x);
      tint = mix(view.birth.rgb, view.alive.rgb, settled);
      scale = mix(0.55, 1.0, settled);
      intensity = mix(1.8, 1.0, settled);
    } else if (events.y > 0.0) {
      let collapse = clamp((1.0 - events.y) / view.shrink, 0.0, 1.0);
      tint = view.death.rgb;
      scale = 1.0 - collapse;
      intensity = select(events.y * 0.45, events.y, collapse < 1.0);
    }

    if (view.geometry < 0.5 && intensity > 0.0) {
      scale = 1.0;
    }

    if (scale > 0.0 && intensity > 0.0) {
      let aa = max(1.0 / view.cellPx, 0.002);
      let distance = boxDistance(local, 0.5 * scale, 0.16 * scale);
      colour += tint * intensity * (1.0 - smoothstep(-aa, aa, distance));
    }

    if (view.grid > 0.5) {
      let edge = min(min(local.x + 0.5, 0.5 - local.x), min(local.y + 0.5, 0.5 - local.y));
      colour = mix(colour, colour + vec3<f32>(0.035), 1.0 - smoothstep(0.0, 1.0 / view.cellPx, edge));
    }
  }

  if (view.glow > 0.0) {
    let extent = view.cellPx * vec2<f32>(f32(view.cols), f32(view.rows));
    let uv = position.xy / extent;
    let near = textureSampleLevel(emissive, samp, uv, 1.0).rgb;
    let far = textureSampleLevel(emissive, samp, uv, 2.0).rgb;
    colour += (near * 0.55 + far) * view.glow;
  }

  return vec4<f32>(colour, 1.0);
}
