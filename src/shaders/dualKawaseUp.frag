#version 300 es
precision highp float;

uniform sampler2D u_Texture;
uniform vec2 u_TexelSize;
uniform float u_Offset;

in vec2 v_Uv;
out vec4 fragColor;

void main() {
    vec2 halfPixel = u_TexelSize * 0.5 * u_Offset;

    vec4 sum = vec4(0.0);
    // 8-tap tent filter
    sum += texture(u_Texture, v_Uv + vec2(-halfPixel.x * 2.0, 0.0));
    sum += texture(u_Texture, v_Uv + vec2(-halfPixel.x, halfPixel.y)) * 2.0;
    sum += texture(u_Texture, v_Uv + vec2(0.0, halfPixel.y * 2.0));
    sum += texture(u_Texture, v_Uv + vec2(halfPixel.x, halfPixel.y)) * 2.0;
    sum += texture(u_Texture, v_Uv + vec2(halfPixel.x * 2.0, 0.0));
    sum += texture(u_Texture, v_Uv + vec2(halfPixel.x, -halfPixel.y)) * 2.0;
    sum += texture(u_Texture, v_Uv + vec2(0.0, -halfPixel.y * 2.0));
    sum += texture(u_Texture, v_Uv + vec2(-halfPixel.x, -halfPixel.y)) * 2.0;

    fragColor = sum * (1.0 / 12.0);
}
