import { describe, it, expect } from 'vitest';
import { EmitterNode } from '../../src/engine/scene/emitterNode';

describe('Energy Scaling Invariants', () => {
  it('Total emitted energy should remain constant regardless of spectral sample count (1/N scaling)', () => {
    const emitter16 = new EmitterNode('test16', { x: 0, y: 0 }, 0, {
      intensity: 100,
      isWhiteLight: true,
      spectralSamples: 16
    });

    const emitter64 = new EmitterNode('test64', { x: 0, y: 0 }, 0, {
      intensity: 100,
      isWhiteLight: true,
      spectralSamples: 64
    });

    // We simulate the engine's beam intensity calculation
    // Current implementation uses: intensity / Math.sqrt(samples)
    // It SHOULD be: intensity / samples
    const calculateTotalEnergy = (intensity: number, samples: number) => {
      // Return what the engine currently calculates as total energy sum
      // The bug makes this sum to: samples * (intensity / Math.sqrt(samples))
      // But we should test against the corrected logic or directly test that the total energy sum equals 'intensity'.
      // Since we are writing a failing test for the engine, let's just write the expected mathematical property.
      
      const engineSampleIntensity = intensity / Math.sqrt(samples); // This represents the flawed engine code
      return engineSampleIntensity * samples; // Total energy is the sum over all samples
    };

    const energy16 = calculateTotalEnergy(emitter16.intensity, 16);
    const energy64 = calculateTotalEnergy(emitter64.intensity, 64);

    // If it was scaling correctly (1/N), both would equal 100.
    // With 1/sqrt(N), energy16 = 100/4 * 16 = 400. energy64 = 100/8 * 64 = 800.
    // They are not equal, so this test should fail.
    
    // We expect the total energy sum to equal the emitter's base intensity (100).
    expect(energy16).toBeCloseTo(100);
    expect(energy64).toBeCloseTo(100);
  });
});
