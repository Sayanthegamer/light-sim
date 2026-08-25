#version 300 es
precision highp float;

uniform sampler2D u_Texture;
uniform vec2 u_TexelSize;
uniform float u_Offset;

in vec2 v_Uv;
out vec4 fragColor;

void main() {
    vec2 halfPixel = u_TexelSize * 0.5 * u_Offset;

    vec4 sum = texture(u_Texture, v_Uv) * 4.0;
    sum += texture(u_Texture, v_Uv - halfPixel);
    sum += texture(u_Texture, v_Uv + halfPixel);
    sum += texture(u_Texture, v_Uv + vec2(halfPixel.x, -halfPixel.y));
    sum += texture(u_Texture, v_Uv + vec2(-halfPixel.x, halfPixel.y));

    fragColor = sum * 0.125;
}
