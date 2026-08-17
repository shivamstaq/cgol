struct View {
  cols: u32,
  rows: u32,
  wordsPerRow: u32,
  cellPx: f32,
  alive: vec4<f32>,
  dead: vec4<f32>,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> state: array<u32>;

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
  let cell = vec2<u32>(floor(position.xy / view.cellPx));
  if (cell.x >= view.cols || cell.y >= view.rows) {
    return view.dead;
  }
  let word = state[cell.y * view.wordsPerRow + cell.x / 32u];
  return select(view.dead, view.alive, ((word >> (cell.x % 32u)) & 1u) == 1u);
}
