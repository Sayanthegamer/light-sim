#version 300 es
precision highp float;

uniform sampler2D u_CurrentFrame;
uniform sampler2D u_AccumulatedFrame;
uniform float u_BlendWeight;

in vec2 v_Uv;
out vec4 fragColor;

void main() {
    vec4 current = texture(u_CurrentFrame, v_Uv);
    vec4 accumulated = texture(u_AccumulatedFrame, v_Uv);
    fragColor = mix(accumulated, current, u_BlendWeight);
}
