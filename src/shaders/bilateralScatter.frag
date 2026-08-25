#version 300 es
precision highp float;

uniform sampler2D u_LightTexture;
uniform sampler2D u_MaskTexture;
uniform vec2 u_Direction;
uniform float u_Radius;
uniform float u_HazeDensity;

in vec2 v_Uv;
out vec4 fragColor;

void main() {
    float maskCenter = texture(u_MaskTexture, v_Uv).r;
    if (maskCenter > 0.5) {
        fragColor = vec4(0.0);
        return;
    }

    // 5-tap separable bilateral Gaussian weights and offsets
    const float offsets[3] = float[3](0.0, 1.3846153846, 3.2307692308);
    const float weights[3] = float[3](0.2270270270, 0.3162162162, 0.0702702703);

    vec4 colorSum = texture(u_LightTexture, v_Uv) * weights[0];
    float weightSum = weights[0];

    for (int i = 1; i < 3; i++) {
        vec2 offsetCoord = u_Direction * (offsets[i] * u_Radius);

        // Positive direction tap
        vec2 uvPos = v_Uv + offsetCoord;
        float maskPos = texture(u_MaskTexture, uvPos).r;
        if (maskPos <= 0.5) {
            colorSum += texture(u_LightTexture, uvPos) * weights[i];
            weightSum += weights[i];
        }

        // Negative direction tap
        vec2 uvNeg = v_Uv - offsetCoord;
        float maskNeg = texture(u_MaskTexture, uvNeg).r;
        if (maskNeg <= 0.5) {
            colorSum += texture(u_LightTexture, uvNeg) * weights[i];
            weightSum += weights[i];
        }
    }

    vec4 filteredColor = weightSum > 1e-4 ? (colorSum / weightSum) : vec4(0.0);
    fragColor = filteredColor * u_HazeDensity;
}
