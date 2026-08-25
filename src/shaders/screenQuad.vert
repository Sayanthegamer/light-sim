#version 300 es
precision highp float;

layout(location = 0) in vec2 a_Position;
out vec2 v_Uv;

void main() {
    v_Uv = a_Position * 0.5 + 0.5;
    gl_Position = vec4(a_Position, 0.0, 1.0);
}

