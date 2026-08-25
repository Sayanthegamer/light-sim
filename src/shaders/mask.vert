#version 300 es
precision highp float;

uniform vec2 u_Resolution;

in vec2 a_Position;

void main() {
    vec2 clipSpace = (a_Position / u_Resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
}
