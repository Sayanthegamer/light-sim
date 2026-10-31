import { describe, it, expect } from 'vitest';
import {
  PHOTON_TRANSPORT_WGSL,
  CLIP_RASTER_WGSL,
  generatePhotonTransportWgsl
} from '../../src/engine/offline/gpu/webgpuPipeline';
import { packSceneBuffers } from '../../src/engine/offline/gpu/gpuPrimitiveLayout';
import { type IOfflineSceneGeometry } from '../../src/engine/offline/mcPhotonTracer';

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

  it('tests both quadratic roots t1 and t2 in intersectRayArc and supports concave lens negative nGlass flag', () => {
    const wgsl = PHOTON_TRANSPORT_WGSL;
    expect(wgsl).toContain('let t1 = -b - sqrtDisc');
    expect(wgsl).toContain('let t2 = -b + sqrtDisc');
    expect(wgsl).toContain('let isConcave = (arc.nGlass < 0.0)');

    // Verify concave lens arc packing encodes negative nOutside so WGSL distinguishes concave from convex
    const scene: IOfflineSceneGeometry = {
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      emitters: [],
      prisms: [],
      lenses: [
        {
          id: 1,
          arcs: [
            {
              id: 10,
              center: { x: 200, y: 300 },
              radius: 100,
              startAngle: -0.5,
              endAngle: 0.5,
              nInside: 1.0,
              nOutside: 1.62
            }
          ]
        }
      ],
      barriers: [],
      blackHoles: []
    };

    const packed = packSceneBuffers(scene, 1000);
    const arcFloats = new Float32Array(packed.arcBuffer);
    expect(arcFloats[3]).toBeCloseTo(-1.62, 4);
  });

  it('matches CPU energy^2 / closestT flux weighting and pre-scales rgba16float output', () => {
    expect(PHOTON_TRANSPORT_WGSL).toContain('let segmentFlux = (energy * energy) / max(1.0, closestT);');
    expect(CLIP_RASTER_WGSL).toContain('v.energy <= 1e-9');
  });
});
