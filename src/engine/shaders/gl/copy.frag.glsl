#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uSrc;

layout(location = 0) out uvec4 outWord;

void main() {
  outWord = texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0);
}
