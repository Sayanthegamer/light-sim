#version 300 es
precision highp float;

uniform sampler2D u_Texture;
uniform vec2 u_TexelSize;
uniform float u_Offset;

#ifdef USE_RGBM
#include "includes/rgbm.glsl"
#endif

in vec2 v_Uv;
out vec4 fragColor;

// Helper to conditionally decode
vec3 sampleTexture(vec2 uv) {
    vec4 smpl = texture(u_Texture, uv);
#ifdef USE_RGBM
    return decodeRGBM(smpl);
#else
    return smpl.rgb;
#endif
}

void main() {
    vec2 halfPixel = u_TexelSize * 0.5 * u_Offset;

    vec3 sum = vec3(0.0);
    // 8-tap tent filter
    sum += sampleTexture(v_Uv + vec2(-halfPixel.x * 2.0, 0.0));
    sum += sampleTexture(v_Uv + vec2(-halfPixel.x, halfPixel.y)) * 2.0;
    sum += sampleTexture(v_Uv + vec2(0.0, halfPixel.y * 2.0));
    sum += sampleTexture(v_Uv + vec2(halfPixel.x, halfPixel.y)) * 2.0;
    sum += sampleTexture(v_Uv + vec2(halfPixel.x * 2.0, 0.0));
    sum += sampleTexture(v_Uv + vec2(halfPixel.x, -halfPixel.y)) * 2.0;
    sum += sampleTexture(v_Uv + vec2(0.0, -halfPixel.y * 2.0));
    sum += sampleTexture(v_Uv + vec2(-halfPixel.x, -halfPixel.y)) * 2.0;

    vec3 avg = sum * (1.0 / 12.0);

#ifdef USE_RGBM
    fragColor = encodeRGBM(avg);
#else
    fragColor = vec4(avg, 1.0);
#endif
}
