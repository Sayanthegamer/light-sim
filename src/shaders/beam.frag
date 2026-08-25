#version 300 es
precision highp float;

#include "includes/cie1931.glsl"

in float v_Intensity;
in float v_DispersionU;
in float v_EdgeV;
in vec3 v_ParentColorRGB;

out vec4 fragColor;

void main() {
    // Parabolic soft edge profile across frustum width v in [0, 1]
    // Center (v = 0.5) has peak transmission, edges (v = 0 or 1) taper off softly
    float edgeDist = abs(v_EdgeV - 0.5) * 2.0; // 0 at center, 1 at edge
    float edgeProfile = clamp(1.0 - edgeDist * edgeDist, 0.0, 1.0);

    // Evaluate spectral color from continuous CIE 1931 mapping
    vec3 spectralColor = dispersionUToLinearRGB(v_DispersionU, v_ParentColorRGB);

    // HDR radiant energy output (linear RGB * intensity * edge profile)
    vec3 linearOutput = spectralColor * (v_Intensity * edgeProfile);

    fragColor = vec4(linearOutput, 1.0);
}
