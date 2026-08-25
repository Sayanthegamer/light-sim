#version 300 es
precision highp float;

uniform sampler2D u_CurrentFrame;
uniform sampler2D u_AccumulatedFrame;
uniform float u_BlendWeight;

#ifdef USE_RGBM
#include "includes/rgbm.glsl"
#endif

in vec2 v_Uv;
out vec4 fragColor;

void main() {
    vec4 current = texture(u_CurrentFrame, v_Uv);
    vec4 accumulated = texture(u_AccumulatedFrame, v_Uv);

#ifdef USE_RGBM
    vec3 cRGB = decodeRGBM(current);
    vec3 aRGB = decodeRGBM(accumulated);
    vec3 mixed = mix(aRGB, cRGB, u_BlendWeight);
    fragColor = encodeRGBM(mixed);
#else
    fragColor = mix(accumulated, current, u_BlendWeight);
#endif
}
