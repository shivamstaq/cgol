#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uSrc;
uniform uint uCols;
uniform uint uRows;
uniform uint uBirth;
uniform uint uSurvive;

layout(location = 0) out uvec4 outWord;

uint bitAt(int row, int x) {
  int cols = int(uCols);
  int wrapped = x < 0 ? x + cols : (x >= cols ? x - cols : x);
  uint word = texelFetch(uSrc, ivec2(wrapped >> 5, row), 0).r;
  return (word >> uint(wrapped & 31)) & 1u;
}

uvec2 sum3(uint a, uint b, uint c) {
  uint ab = a ^ b;
  return uvec2(ab ^ c, (a & b) | (ab & c));
}

uvec3 triple(int row, int wx, int firstX, uint wordBits) {
  uint centre = texelFetch(uSrc, ivec2(wx, row), 0).r;
  uint left = (centre << 1u) | bitAt(row, firstX - 1);
  uint right = (centre >> 1u) | (bitAt(row, firstX + int(wordBits)) << (wordBits - 1u));
  return uvec3(left, centre, right);
}

void main() {
  int wx = int(gl_FragCoord.x);
  int y = int(gl_FragCoord.y);
  int rows = int(uRows);
  int firstX = wx * 32;
  uint wordBits = min(32u, uCols - uint(firstX));

  uvec3 up = triple((y + rows - 1) % rows, wx, firstX, wordBits);
  uvec3 mid = triple(y, wx, firstX, wordBits);
  uvec3 dn = triple((y + 1) % rows, wx, firstX, wordBits);

  uvec2 a = sum3(up.x, up.y, up.z);
  uvec2 b = sum3(dn.x, dn.y, dn.z);
  uvec2 m = uvec2(mid.x ^ mid.z, mid.x & mid.z);

  uvec2 ones = sum3(a.x, b.x, m.x);
  uvec2 twos = sum3(a.y, b.y, m.y);

  uint b0 = ones.x;
  uint b1 = twos.x ^ ones.y;
  uint carry4 = twos.x & ones.y;
  uint b2 = twos.y ^ carry4;
  uint b3 = twos.y & carry4;

  uint born = 0u;
  uint surv = 0u;
  for (uint k = 0u; k < 9u; k++) {
    uint eq =
      ((k & 1u) != 0u ? b0 : ~b0) &
      ((k & 2u) != 0u ? b1 : ~b1) &
      ((k & 4u) != 0u ? b2 : ~b2) &
      ((k & 8u) != 0u ? b3 : ~b3);
    born |= eq & (0u - ((uBirth >> k) & 1u));
    surv |= eq & (0u - ((uSurvive >> k) & 1u));
  }

  uint tail = wordBits == 32u ? 0xFFFFFFFFu : (1u << wordBits) - 1u;
  outWord = uvec4(((~mid.y & born) | (mid.y & surv)) & tail, 0u, 0u, 0u);
}
