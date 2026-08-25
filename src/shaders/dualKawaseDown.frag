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

    vec3 sum = sampleTexture(v_Uv) * 4.0;
    sum += sampleTexture(v_Uv - halfPixel);
    sum += sampleTexture(v_Uv + halfPixel);
    sum += sampleTexture(v_Uv + vec2(halfPixel.x, -halfPixel.y));
    sum += sampleTexture(v_Uv + vec2(-halfPixel.x, halfPixel.y));

    vec3 avg = sum * 0.125;

#ifdef USE_RGBM
    fragColor = encodeRGBM(avg);
#else
    fragColor = vec4(avg, 1.0);
#endif
}
