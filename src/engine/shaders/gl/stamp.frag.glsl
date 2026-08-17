#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uBase;
uniform usampler2D uMask;
uniform uint uCols;
uniform uint uShape;
uniform vec2 uP0;
uniform vec2 uP1;
uniform float uRadius;
uniform float uScatter;
uniform uint uSeed;

layout(location = 0) out uvec4 outMask;
layout(location = 1) out uvec4 outState;

uint pcg(uint value) {
  uint mixed = value * 747796405u + 2891336453u;
  uint word = ((mixed >> ((mixed >> 28u) + 4u)) ^ mixed) * 277803737u;
  return (word >> 22u) ^ word;
}

float rand01(uint x, uint y) {
  return float(pcg(x * 1973u + y * 9277u + uSeed * 26699u)) / 4294967295.0;
}

bool covered(vec2 point) {
  vec2 span = uP1 - uP0;
  float t = clamp(dot(point - uP0, span) / max(dot(span, span), 1e-6), 0.0, 1.0);
  vec2 delta = point - (uP0 + span * t);
  if (uShape == 1u) {
    return max(abs(delta.x), abs(delta.y)) <= uRadius;
  }
  return length(delta) <= uRadius;
}

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  uint firstX = uint(texel.x) * 32u;
  uint wordBits = min(32u, uCols - firstX);
  uint bits = texelFetch(uMask, texel, 0).r;

  for (uint i = 0u; i < wordBits; i++) {
    uint x = firstX + i;
    vec2 point = vec2(float(x) + 0.5, float(texel.y) + 0.5);
    if (covered(point) && (uScatter >= 1.0 || rand01(x, uint(texel.y)) < uScatter)) {
      bits |= 1u << i;
    }
  }

  outMask = uvec4(bits, 0u, 0u, 0u);
  outState = uvec4(texelFetch(uBase, texel, 0).r ^ bits, 0u, 0u, 0u);
}
