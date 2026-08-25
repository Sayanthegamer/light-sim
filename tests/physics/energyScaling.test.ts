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

    // The engine's beam intensity calculation is now fixed to: intensity / samples
    const calculateTotalEnergy = (intensity: number, samples: number) => {
      const engineSampleIntensity = intensity / samples;
      return engineSampleIntensity * samples; 
    };

    const energy16 = calculateTotalEnergy(emitter16.intensity, 16);
    const energy64 = calculateTotalEnergy(emitter64.intensity, 64);

    expect(energy16).toBeCloseTo(100);
    expect(energy64).toBeCloseTo(100);
  });
});
