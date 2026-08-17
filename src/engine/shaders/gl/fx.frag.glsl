#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uCurrent;
uniform usampler2D uPrevious;
uniform sampler2D uFx;
uniform uint uStepped;
uniform float uBirthDecay;
uniform float uDeathDecay;

layout(location = 0) out vec4 outFx;

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 events = texelFetch(uFx, cell, 0).rg;
  events.x = max(events.x - uBirthDecay, 0.0);
  events.y = max(events.y - uDeathDecay, 0.0);

  if (uStepped == 1u) {
    ivec2 texel = ivec2(cell.x >> 5, cell.y);
    uint bit = uint(cell.x & 31);
    uint now = (texelFetch(uCurrent, texel, 0).r >> bit) & 1u;
    uint before = (texelFetch(uPrevious, texel, 0).r >> bit) & 1u;

    if (now == 1u && before == 0u) {
      events = vec2(1.0, 0.0);
    } else if (now == 0u && before == 1u) {
      events = vec2(0.0, 1.0);
    }
  }

  outFx = vec4(events, 0.0, 1.0);
}
