#version 300 es
precision highp float;

uniform sampler2D u_Tier1Texture;
uniform sampler2D u_Tier2Texture;
uniform float u_BloomIntensity;

in vec2 v_Uv;
out vec4 fragColor;

void main() {
    vec4 tier1 = texture(u_Tier1Texture, v_Uv);
    vec4 tier2 = texture(u_Tier2Texture, v_Uv);
    fragColor = tier1 + tier2 * u_BloomIntensity;
}
