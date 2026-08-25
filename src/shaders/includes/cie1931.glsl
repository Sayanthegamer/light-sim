// CIE 1931 Continuous Spectral Color Matching Functions (GLSL 3.00 ES)
// Multi-lobe Gaussian analytic fit (Wyman et al. 2013)

float gaussianLobe(float x, float mu, float sigma1, float sigma2) {
    float s = (x < mu) ? sigma1 : sigma2;
    float t = (x - mu) / s;
    return exp(-0.5 * t * t);
}

vec3 wavelengthToXYZ(float wavelengthNm) {
    float wl = clamp(wavelengthNm, 380.0, 780.0);

    float x = 1.056 * gaussianLobe(wl, 599.8, 37.9, 31.0)
            + 0.362 * gaussianLobe(wl, 442.0, 16.0, 26.7)
            - 0.065 * gaussianLobe(wl, 501.1, 20.4, 18.9);

    float y = 0.821 * gaussianLobe(wl, 568.8, 46.9, 40.5)
            + 0.286 * gaussianLobe(wl, 530.9, 16.3, 31.1);

    float z = 1.217 * gaussianLobe(wl, 437.0, 11.8, 36.0)
            + 0.681 * gaussianLobe(wl, 459.0, 26.0, 13.8);

    return max(vec3(0.0), vec3(x, y, z));
}

vec3 xyzToLinearRGB(vec3 xyz) {
    mat3 m = mat3(
         3.2404542, -0.9692660,  0.0556434,
        -1.5371385,  1.8760108, -0.2040259,
        -0.4985314,  0.0415560,  1.0572252
    );
    return max(vec3(0.0), m * xyz);
}

vec3 wavelengthToLinearRGB(float wavelengthNm) {
    vec3 xyz = wavelengthToXYZ(wavelengthNm);
    return xyzToLinearRGB(xyz);
}

// Maps normalized dispersion coordinate u in [0, 1] to continuous Linear sRGB.
// u = 0.0 -> Red (780 nm)
// u = 1.0 -> Violet (380 nm)
// u < 0.0 (e.g. -1.0) -> Monochromatic White / Un-dispersed Beam
vec3 dispersionUToLinearRGB(float u, vec3 parentTint) {
    if (u < 0.0) {
        return parentTint;
    }
    float wl = 780.0 - clamp(u, 0.0, 1.0) * 400.0;
    vec3 spectralColor = wavelengthToLinearRGB(wl);
    return spectralColor * parentTint;
}
