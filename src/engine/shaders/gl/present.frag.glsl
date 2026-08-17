#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uState;
uniform uint uCols;
uniform uint uRows;
uniform float uCellPx;
uniform float uHeight;
uniform vec4 uAlive;
uniform vec4 uDead;

out vec4 fragColor;

void main() {
  uint cx = uint(floor(gl_FragCoord.x / uCellPx));
  uint cy = uint(floor((uHeight - gl_FragCoord.y) / uCellPx));

  if (cx >= uCols || cy >= uRows) {
    fragColor = uDead;
    return;
  }

  uint word = texelFetch(uState, ivec2(int(cx >> 5u), int(cy)), 0).r;
  fragColor = ((word >> (cx & 31u)) & 1u) == 1u ? uAlive : uDead;
}
