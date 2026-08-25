#version 300 es
precision highp float;

out vec2 v_Uv;

void main() {
    // Generates a full-screen triangle covering [-1, 1] with UVs in [0, 1]
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_Uv = vec2(x * 0.5 + 0.5, y * 0.5 + 0.5);
    gl_Position = vec4(x, y, 0.0, 1.0);
}
