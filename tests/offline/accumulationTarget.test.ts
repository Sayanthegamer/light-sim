import { describe, it, expect } from 'vitest';
import { AccumulationTarget } from '../../src/engine/offline/accumulationTarget';

describe('32-Bit Float Accumulation Target & Progressive Tonemapper', () => {
  it('allocates RGBA32F float buffer matching specified dimensions', () => {
    const target = new AccumulationTarget(100, 50);
    expect(target.width).toBe(100);
    expect(target.height).toBe(50);
    expect(target.buffer.length).toBe(100 * 50 * 4);
    expect(target.sampleCountMap.length).toBe(100 * 50);
  });

  it('splats continuous XYZ sample into target buffer with weight accumulation', () => {
    const target = new AccumulationTarget(10, 10);
    target.splat(5, 5, { x: 0.5, y: 1.0, z: 0.2 }, 1.0);

    const idx = (5 * 10 + 5) * 4;
    expect(target.buffer[idx]).toBeCloseTo(0.5, 4);
    expect(target.buffer[idx + 1]).toBeCloseTo(1.0, 4);
    expect(target.buffer[idx + 2]).toBeCloseTo(0.2, 4);
    expect(target.buffer[idx + 3]).toBeCloseTo(1.0, 4);
    expect(target.sampleCountMap[5 * 10 + 5]).toBe(1);
  });

  it('merges tile buffer packets from worker threads into master buffer', () => {
    const master = new AccumulationTarget(20, 20);
    const tileBuffer = new Float32Array(10 * 10 * 4);

    // Populate tile (0, 0)
    for (let i = 0; i < 100; i++) {
      tileBuffer[i * 4 + 0] = 0.8;
      tileBuffer[i * 4 + 1] = 0.4;
      tileBuffer[i * 4 + 2] = 0.1;
      tileBuffer[i * 4 + 3] = 1.0;
    }

    master.mergeTile(0, 0, 10, 10, tileBuffer);

    // Check pixel at (5, 5)
    const idx = (5 * 20 + 5) * 4;
    expect(master.buffer[idx]).toBeCloseTo(0.8, 4);
    expect(master.buffer[idx + 1]).toBeCloseTo(0.4, 4);
  });

  it('resolves HDR buffer into 8-bit sRGB with Extended Reinhard tonemapping', () => {
    const target = new AccumulationTarget(2, 2);
    // Splat bright HDR white
    target.splat(0, 0, { x: 5.0, y: 5.0, z: 5.0 }, 1.0);

    const outBytes = new Uint8ClampedArray(2 * 2 * 4);
    target.resolveToImageData(outBytes, { exposure: 1.0, tonemap: 'reinhard' });

    // Pixel (0,0) should be clamped cleanly in 8-bit [0, 255] without overflow/wrap
    expect(outBytes[0]).toBeGreaterThan(200);
    expect(outBytes[0]).toBeLessThanOrEqual(255);
    expect(outBytes[3]).toBe(255); // Alpha
  });

  it('resets buffer and sample counts on clear', () => {
    const target = new AccumulationTarget(10, 10);
    target.splat(2, 2, { x: 1, y: 1, z: 1 }, 1);
    expect(target.getTotalSamples()).toBeGreaterThan(0);

    target.reset();
    expect(target.getTotalSamples()).toBe(0);
    expect(target.buffer[0]).toBe(0);
  });
});
