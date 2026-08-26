import { describe, it, expect } from 'vitest';
import {
  PHOTON_TRANSPORT_WGSL,
  generatePhotonTransportWgsl
} from '../../src/engine/offline/gpu/webgpuPipeline';

describe('Physical Optics WGSL Kernel Completeness & Accuracy', () => {
  it('generates complete physical optics shader containing arc intersections, Fresnel math, and Schwarzschild geodesics', () => {
    const wgsl = generatePhotonTransportWgsl({ maxBounces: 32, workgroupSize: 64 });

    // Structs
    expect(wgsl).toContain('struct BVHNode');
    expect(wgsl).toContain('struct SegmentPrimitive');
    expect(wgsl).toContain('struct ArcPrimitive');
    expect(wgsl).toContain('struct BlackHolePrimitive');
    expect(wgsl).toContain('struct EmitterPrimitive');
    expect(wgsl).toContain('struct PhotonVertex');

    // Color & Dispersion
    expect(wgsl).toContain('fn wavelengthToRGB');
    expect(wgsl).toContain('fn evaluateCauchy');

    // Geometry Intersections
    expect(wgsl).toContain('fn intersectRaySegment');
    expect(wgsl).toContain('fn intersectRayArc');
    expect(wgsl).toContain('fn intersectAABB');

    // Relativistic Curvature
    expect(wgsl).toContain('fn stepSchwarzschildGeodesic');

    // Short-stack BVH
    expect(wgsl).toContain('var stack: array<u32, 8>');
  });

  it('includes proper Snell and Fresnel reflection/transmission coefficient formulas', () => {
    const wgsl = PHOTON_TRANSPORT_WGSL;
    expect(wgsl).toContain('let rPerp = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT)');
    expect(wgsl).toContain('let rPar = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT)');
    expect(wgsl).toContain('let R = 0.5 * (rPerp * rPerp + rPar * rPar)');
  });
});
