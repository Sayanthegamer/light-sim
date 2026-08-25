#version 300 es
precision highp float;

// Uniforms
uniform vec2 u_Resolution;

// Attributes (24-byte interleaved layout)
in vec2 a_Position;         // offset 0 (float x 2)
in float a_Intensity;       // offset 8 (float)
in float a_DispersionU;     // offset 12 (float)
in float a_EdgeV;           // offset 16 (float)
in vec4 a_ParentColorRGB;   // offset 20 (uint8x4 normalized)

// Varyings to Fragment Shader
out float v_Intensity;
out float v_DispersionU;
out float v_EdgeV;
out vec3 v_ParentColorRGB;

void main() {
    v_Intensity = a_Intensity;
    v_DispersionU = a_DispersionU;
    v_EdgeV = a_EdgeV;
    v_ParentColorRGB = a_ParentColorRGB.rgb;

    // Convert pixel coordinates (0..w, 0..h with top-left origin) to clip space (-1..1)
    vec2 clipSpace = (a_Position / u_Resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
}
