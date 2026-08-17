#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uSrc;
uniform uint uCols;
uniform uint uSrcCols;
uniform uint uSrcRows;
uniform int uDx;
uniform int uDy;

layout(location = 0) out uvec4 outWord;

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  uint firstX = uint(texel.x) * 32u;
  uint wordBits = min(32u, uCols - firstX);
  int srcY = texel.y - uDy;

  uint out_ = 0u;
  if (srcY >= 0 && srcY < int(uSrcRows)) {
    for (uint i = 0u; i < wordBits; i++) {
      int srcX = int(firstX + i) - uDx;
      if (srcX >= 0 && srcX < int(uSrcCols)) {
        uint word = texelFetch(uSrc, ivec2(srcX >> 5, srcY), 0).r;
        out_ |= ((word >> uint(srcX & 31)) & 1u) << i;
      }
    }
  }

  outWord = uvec4(out_, 0u, 0u, 0u);
}
