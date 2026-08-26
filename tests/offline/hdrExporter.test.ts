import { describe, it, expect } from 'vitest';
import {
  encodeRGBE,
  decodeRGBE,
  encodeHDR
} from '../../src/engine/offline/hdrExporter';

describe('Radiance 32-Bit HDR Binary Encoder', () => {
  it('encodes and decodes float RGB values with minimal quantization error', () => {
    const testColors = [
      [1.0, 0.5, 0.25],
      [10.5, 2.0, 0.01],
      [0.001, 0.0005, 0.0002],
      [100.0, 100.0, 100.0]
    ];

    for (const [r, g, b] of testColors) {
      const [re, ge, be, e] = encodeRGBE(r, g, b);
      expect(e).toBeGreaterThan(0);

      const [dr, dg, db] = decodeRGBE(re, ge, be, e);
      expect(dr).toBeCloseTo(r, 1);
      expect(dg).toBeCloseTo(g, 1);
      expect(db).toBeCloseTo(b, 1);
    }
  });

  it('encodes zero RGB into [0, 0, 0, 0]', () => {
    const [re, ge, be, e] = encodeRGBE(0, 0, 0);
    expect(re).toBe(0);
    expect(ge).toBe(0);
    expect(be).toBe(0);
    expect(e).toBe(0);
  });

  it('generates valid Radiance HDR binary buffer with standard header', () => {
    const width = 4;
    const height = 4;
    const buffer = new Float32Array(width * height * 4);

    // Set pixel (0, 0)
    buffer[0] = 1.0;
    buffer[1] = 2.0;
    buffer[2] = 0.5;
    buffer[3] = 1.0;

    const hdrBytes = encodeHDR(buffer, width, height);
    expect(hdrBytes.length).toBeGreaterThan(50);

    const headerText = new TextDecoder().decode(hdrBytes.subarray(0, 80));
    expect(headerText).toContain('#?RADIANCE');
    expect(headerText).toContain('FORMAT=32-bit_rle_rgbe');
    expect(headerText).toContain('-Y 4 +X 4');
  });
});
