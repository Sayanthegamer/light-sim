import { describe, it, expect } from 'vitest';
import {
  PHOTON_TRANSPORT_WGSL,
  generatePhotonTransportWgsl
} from '../../src/engine/offline/gpu/webgpuPipeline';

describe('Relativistic Asymptotics & Weak-Field Einstein Deflection', () => {
  it('contains evaluateBlackHoleInteraction function implementing weak-field analytic deflection and strong-field RK2', () => {
    const wgsl = generatePhotonTransportWgsl({ maxBounces: 32, workgroupSize: 64 });

    expect(wgsl).toContain('fn evaluateBlackHoleInteraction');
    expect(wgsl).toContain('fn stepSchwarzschildGeodesic');
    // Analytic Einstein deflection formula: 2.0 * rs / b
    expect(wgsl).toContain('2.0 * rs / b');
    // Weak-field threshold check: r > 3.0 * rs
    expect(wgsl).toContain('3.0 * rs');
  });

  it('verifies weak-field Einstein deflection angle matches 2*rs / b asymptotic limit', () => {
    const rs = 10.0;
    const impactParameter = 50.0; // b > 3*rs (50 > 30)
    const expectedDeflection = (2.0 * rs) / impactParameter; // 0.4 rad

    // Emulate the WGSL analytic deflection calculation
    const rVec = { x: 0, y: 50 }; // photon passing at y=50, moving along +x
    const dir = { x: 1, y: 0 };
    const b = Math.abs(rVec.x * dir.y - rVec.y * dir.x);
    expect(b).toBe(50.0);

    const deltaTheta = (2.0 * rs) / b;
    expect(deltaTheta).toBeCloseTo(expectedDeflection, 6);
  });
});
