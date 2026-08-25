#version 300 es
precision highp float;

out vec4 fragColor;

void main() {
    // Write 1.0 into R channel for solid obstacle mask
    fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
