#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uState;
uniform sampler2D uFx;
uniform sampler2D uEmissive;
uniform uint uCols;
uniform uint uRows;
uniform float uCellPx;
uniform float uHeight;
uniform float uGlow;
uniform float uGrid;
uniform float uGeometry;
uniform float uShrink;
uniform vec4 uAlive;
uniform vec4 uDead;
uniform vec4 uBirth;
uniform vec4 uDeath;

out vec4 fragColor;

/** Signed distance to a rounded square, cell units. */
float boxDistance(vec2 local, float half_, float radius) {
  vec2 outer = abs(local) - vec2(max(half_ - radius, 0.0));
  return length(max(outer, vec2(0.0))) + min(max(outer.x, outer.y), 0.0) - radius;
}

void main() {
  vec2 surface = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y);
  vec2 gridPoint = surface / uCellPx;
  uvec2 cell = uvec2(floor(gridPoint));
  vec3 colour = uDead.rgb;

  if (cell.x < uCols && cell.y < uRows) {
    vec2 local = fract(gridPoint) - vec2(0.5);
    uint word = texelFetch(uState, ivec2(int(cell.x >> 5u), int(cell.y)), 0).r;
    bool alive = ((word >> (cell.x & 31u)) & 1u) == 1u;
    vec2 events = texelFetch(uFx, ivec2(cell), 0).rg;

    vec3 tint = uDead.rgb;
    float scale = 0.0;
    float intensity = 0.0;

    if (alive) {
      float settled = smoothstep(0.0, 1.0, 1.0 - events.x);
      tint = mix(uBirth.rgb, uAlive.rgb, settled);
      scale = mix(0.55, 1.0, settled);
      intensity = mix(1.8, 1.0, settled);
    } else if (events.y > 0.0) {
      float collapse = clamp((1.0 - events.y) / uShrink, 0.0, 1.0);
      tint = uDeath.rgb;
      scale = 1.0 - collapse;
      intensity = collapse < 1.0 ? events.y : events.y * 0.45;
    }

    if (uGeometry < 0.5 && intensity > 0.0) {
      scale = 1.0;
    }

    if (scale > 0.0 && intensity > 0.0) {
      float aa = max(1.0 / uCellPx, 0.002);
      float distance = boxDistance(local, 0.5 * scale, 0.16 * scale);
      colour += tint * intensity * (1.0 - smoothstep(-aa, aa, distance));
    }

    if (uGrid > 0.5) {
      float edge = min(min(local.x + 0.5, 0.5 - local.x), min(local.y + 0.5, 0.5 - local.y));
      colour = mix(colour, colour + vec3(0.035), 1.0 - smoothstep(0.0, 1.0 / uCellPx, edge));
    }
  }

  if (uGlow > 0.0) {
    vec2 uv = surface / (uCellPx * vec2(float(uCols), float(uRows)));
    vec3 near = textureLod(uEmissive, uv, 1.0).rgb;
    vec3 far = textureLod(uEmissive, uv, 2.0).rgb;
    colour += (near * 0.55 + far) * uGlow;
  }

  fragColor = vec4(colour, 1.0);
}
