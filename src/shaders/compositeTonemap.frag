#version 300 es
precision highp float;

uniform sampler2D u_BeamTexture;
uniform sampler2D u_ScatterTexture;
uniform sampler2D u_MaskTexture;

uniform float u_Exposure;
uniform float u_WhitePoint;
uniform float u_ScatterWeight;

in vec2 v_Uv;
out vec4 fragColor;

// Relative luminance (Rec. 709 / sRGB coefficients)
float getLuminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Luminance-weighted Extended Reinhard Tonemapping
vec3 extendedReinhard(vec3 c, float lWhite) {
    float lIn = getLuminance(c);
    if (lIn <= 1e-6) return vec3(0.0);
    
    float lWhiteSq = lWhite * lWhite;
    float factor = (1.0 + (lIn / lWhiteSq)) / (1.0 + lIn);
    return c * factor;
}

// Linear RGB to sRGB gamma correction (gamma = 2.2)
vec3 toSRGB(vec3 linearColor) {
    return pow(clamp(linearColor, 0.0, 1.0), vec3(1.0 / 2.2));
}

#ifdef USE_RGBM
#include "includes/rgbm.glsl"
#endif

void main() {
    vec4 beamTex = texture(u_BeamTexture, v_Uv);
    vec4 scatterTex = texture(u_ScatterTexture, v_Uv);
    float mask = texture(u_MaskTexture, v_Uv).r;

#ifdef USE_RGBM
    vec3 beamRGB = decodeRGBM(beamTex);
    vec3 scatterRGB = decodeRGBM(scatterTex);
#else
    vec3 beamRGB = beamTex.rgb;
    vec3 scatterRGB = scatterTex.rgb;
#endif

    // Reject atmospheric scatter inside solid obstacles, while adding a subtle optical glass silhouette
    float effectiveScatter = mask > 0.5 ? 0.0 : u_ScatterWeight;

    // Linear color addition in HDR space
    vec3 linearSum = (beamRGB + scatterRGB * effectiveScatter) * u_Exposure;

    // Subtle ambient dielectric tint & rim highlight for masked optical elements in the dark
    float maskEdge = clamp(fwidth(mask) * 1.5, 0.0, 1.0);
    if (mask > 0.5) {
        linearSum += vec3(0.004, 0.006, 0.010);
    }
    linearSum += maskEdge * vec3(0.025, 0.045, 0.070);

    // Luminance-weighted Extended Reinhard tonemapping
    vec3 tonemapped = extendedReinhard(linearSum, u_WhitePoint);

    // Apply sRGB Gamma Transfer (gamma = 2.2)
    vec3 srgbOutput = toSRGB(tonemapped);

    fragColor = vec4(srgbOutput, 1.0);
}
