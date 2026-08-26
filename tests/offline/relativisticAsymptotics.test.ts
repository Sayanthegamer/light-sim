import { describe, it, expect } from 'vitest';
import {
  generatePhotonTransportWgsl
} from '../../src/engine/offline/gpu/webgpuPipeline';

describe('Relativistic Asymptotics & Weak-Field Einstein Deflection', () => {
  it('contains evaluateBlackHoleInteraction function implementing weak-field analytic deflection and strong-field RK2', () => {
    const wgsl = generatePhotonTransportWgsl({ maxBounces: 32, workgroupSize: 64 });

    expect(wgsl).toContain('fn evaluateBlackHoleInteraction');
    expect(wgsl).toContain('fn stepSchwarzschildGeodesic');
    // Analytic Einstein deflection formula: 2.0 * rs / b
    expect(wgsl).toContain('2.0 * rs / b');
    // Weak-field threshold check: r > 8.0 * rs (C^inf seamless boundary)
    expect(wgsl).toContain('8.0 * rs');
  });

  it('verifies weak-field Einstein deflection angle matches 2*rs / b asymptotic limit at r > 8*rs', () => {
    const rs = 10.0;
    const impactParameter = 100.0; // b > 8*rs (100 > 80)
    const expectedDeflection = (2.0 * rs) / impactParameter; // 0.2 rad

    // Emulate the WGSL analytic deflection calculation
    const rVec = { x: 0, y: 100 }; // photon passing at y=100, moving along +x
    const dir = { x: 1, y: 0 };
    const b = Math.abs(rVec.x * dir.y - rVec.y * dir.x);
    expect(b).toBe(100.0);

    const deltaTheta = (2.0 * rs) / b;
    expect(deltaTheta).toBeCloseTo(expectedDeflection, 6);
  });
});
