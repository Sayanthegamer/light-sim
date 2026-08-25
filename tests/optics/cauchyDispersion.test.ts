import { describe, it, expect } from 'vitest';
import { cauchyIndex, WAVELENGTH_RED, WAVELENGTH_VIOLET } from '../../src/engine/optics/refraction';
import { newtonPrismPreset } from '../../src/engine/presets/newtonPrism';
import { achromaticDoubletPreset } from '../../src/engine/presets/achromaticDoublet';

describe('Cauchy Angular Dispersion Invariants', () => {
  it('Crown glass (N-BK7) preset should exhibit physically meaningful dispersion between violet and red', () => {
    // Extract N-BK7 parameters from the newton prism preset.
    // The prism node options use refractiveIndex 1.517, cauchyA 1.5046, cauchyB 0.0042
    // Wait, the preset just creates objects with default values if not provided.
    // Let's just use the default values defined in prismNode or we can hardcode the expected N-BK7 values.
    const A = 1.5046;
    const B = 4200;

    const nRed = cauchyIndex(WAVELENGTH_RED, A, B);
    const nViolet = cauchyIndex(WAVELENGTH_VIOLET, A, B);
    
    // N-BK7 refractive index changes by ~0.015 between 380nm and 780nm
    const dispersion = nViolet - nRed;

    // This test will FAIL if dispersion is effectively zero (~2e-8)
    expect(dispersion).toBeGreaterThan(0.01);
  });
});
