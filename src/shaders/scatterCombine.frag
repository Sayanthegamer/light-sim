#version 300 es
precision highp float;

uniform sampler2D u_Tier1Texture;
uniform sampler2D u_Tier2Texture;
uniform float u_BloomIntensity;

#ifdef USE_RGBM
#include "includes/rgbm.glsl"
#endif

in vec2 v_Uv;
out vec4 fragColor;

void main() {
    vec4 tier1 = texture(u_Tier1Texture, v_Uv);
    vec4 tier2 = texture(u_Tier2Texture, v_Uv);

#ifdef USE_RGBM
    vec3 cTier1 = decodeRGBM(tier1);
    vec3 cTier2 = decodeRGBM(tier2);
    vec3 combined = cTier1 + cTier2 * u_BloomIntensity;
    fragColor = encodeRGBM(combined);
#else
    fragColor = tier1 + tier2 * u_BloomIntensity;
#endif
}
