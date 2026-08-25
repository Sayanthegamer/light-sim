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

void main() {
    vec4 beamColor = texture(u_BeamTexture, v_Uv);
    vec4 scatterColor = texture(u_ScatterTexture, v_Uv);
    float mask = texture(u_MaskTexture, v_Uv).r;

    // Reject atmospheric scatter inside solid obstacles
    float effectiveScatter = mask > 0.5 ? 0.0 : u_ScatterWeight;

    // Linear color addition in HDR space
    vec3 linearSum = (beamColor.rgb + scatterColor.rgb * effectiveScatter) * u_Exposure;

    // Luminance-weighted Extended Reinhard tonemapping
    vec3 tonemapped = extendedReinhard(linearSum, u_WhitePoint);

    // Apply sRGB Gamma Transfer (gamma = 2.2)
    vec3 srgbOutput = toSRGB(tonemapped);

    fragColor = vec4(srgbOutput, 1.0);
}
