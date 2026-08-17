#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uState;
uniform uint uWordsPerRow;

layout(location = 0) out uvec4 outCount;

/** GLSL ES 3.00 has no bitCount. */
uint popcount(uint value) {
  uint x = value - ((value >> 1) & 0x55555555u);
  x = (x & 0x33333333u) + ((x >> 2) & 0x33333333u);
  x = (x + (x >> 4)) & 0x0F0F0F0Fu;
  return (x * 0x01010101u) >> 24;
}

void main() {
  int row = int(gl_FragCoord.y);
  uint total = 0u;
  for (uint word = 0u; word < uWordsPerRow; word++) {
    total += popcount(texelFetch(uState, ivec2(int(word), row), 0).r);
  }
  outCount = uvec4(total, 0u, 0u, 0u);
}
