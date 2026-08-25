vec4 encodeRGBM(vec3 color) {
    vec4 rgbm;
    color *= 1.0 / 6.0;
    rgbm.a = clamp(max(max(color.r, color.g), max(color.b, 1e-6)), 0.0, 1.0);
    rgbm.a = ceil(rgbm.a * 255.0) / 255.0;
    rgbm.rgb = color / rgbm.a;
    return rgbm;
}

vec3 decodeRGBM(vec4 rgbm) {
    return rgbm.rgb * rgbm.a * 6.0;
}
