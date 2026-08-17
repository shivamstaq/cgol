#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uState;
uniform sampler2D uFx;
uniform uint uCols;
uniform uint uRows;
uniform vec4 uAlive;
uniform vec4 uBirth;
uniform vec4 uDeath;

layout(location = 0) out vec4 outColour;

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  if (uint(cell.x) >= uCols || uint(cell.y) >= uRows) {
    outColour = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  uint word = texelFetch(uState, ivec2(cell.x >> 5, cell.y), 0).r;
  bool alive = ((word >> uint(cell.x & 31)) & 1u) == 1u;
  vec2 events = texelFetch(uFx, cell, 0).rg;

  vec3 colour = vec3(0.0);
  if (alive) {
    float settled = smoothstep(0.0, 1.0, 1.0 - events.x);
    colour = mix(uBirth.rgb, uAlive.rgb, settled) * mix(1.8, 1.0, settled);
  } else if (events.y > 0.0) {
    colour = uDeath.rgb * events.y;
  }

  outColour = vec4(colour, 1.0);
}
