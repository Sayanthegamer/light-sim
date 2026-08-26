import { describe, it, expect } from 'vitest';
import {
  tracePhotonPath,
  type IOfflineSceneGeometry,
  type IPhotonState
} from '../../src/engine/offline/mcPhotonTracer';
import { AccumulationTarget } from '../../src/engine/offline/accumulationTarget';

describe('Monte Carlo Photon Tracer & Russian Roulette Transport', () => {
  const target = new AccumulationTarget(100, 100);

  const emptyScene: IOfflineSceneGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    emitters: [],
    prisms: [],
    lenses: [],
    barriers: [],
    blackHoles: [],
    medium: {
      sigmaA: 0.001,
      sigmaS: 0.005,
      sigmaT: 0.006,
      albedo: 0.833,
      g: 0.3,
      mediumType: 'henyey-greenstein'
    }
  };

  it('traces photon path through empty participating medium and splats in-scattering', () => {
    target.reset();
    const photon: IPhotonState = {
      pos: { x: 10, y: 50 },
      dir: { x: 1, y: 0 },
      wavelengthNm: 550,
      energy: 1.0,
      phase: 0.0
    };

    const stats = tracePhotonPath(photon, emptyScene, target, { maxBounces: 50 });
    expect(stats.bounces).toBeGreaterThanOrEqual(0);
    expect(target.getTotalSamples()).toBeGreaterThan(0);
  });

  it('refracts spectral photon across glass prism boundary with Sellmeier dispersion', () => {
    target.reset();
    const prismScene: IOfflineSceneGeometry = {
      ...emptyScene,
      prisms: [
        {
          id: 1,
          vertices: [
            { x: 30, y: 20 },
            { x: 70, y: 50 },
            { x: 30, y: 80 }
          ],
          glass: 'BK7'
        }
      ]
    };

    // Red photon (700 nm)
    const redPhoton: IPhotonState = {
      pos: { x: 10, y: 50 },
      dir: { x: 1, y: 0 },
      wavelengthNm: 700,
      energy: 1.0,
      phase: 0.0
    };
    const redStats = tracePhotonPath(redPhoton, prismScene, target, { maxBounces: 20 });

    // Violet photon (400 nm)
    const violetPhoton: IPhotonState = {
      pos: { x: 10, y: 50 },
      dir: { x: 1, y: 0 },
      wavelengthNm: 400,
      energy: 1.0,
      phase: 0.0
    };
    const violetStats = tracePhotonPath(violetPhoton, prismScene, target, { maxBounces: 20 });

    expect(redStats.bounces).toBeGreaterThan(0);
    expect(violetStats.bounces).toBeGreaterThan(0);
  });

  it('terminates ray when absorbed by opaque barrier or event horizon', () => {
    target.reset();
    const barrierScene: IOfflineSceneGeometry = {
      ...emptyScene,
      barriers: [
        {
          id: 1,
          p1: { x: 50, y: 10 },
          p2: { x: 50, y: 90 }
        }
      ]
    };

    const photon: IPhotonState = {
      pos: { x: 10, y: 50 },
      dir: { x: 1, y: 0 },
      wavelengthNm: 532,
      energy: 1.0,
      phase: 0.0
    };

    const stats = tracePhotonPath(photon, barrierScene, target, { volumetricInScatter: false });
    expect(stats.absorbed).toBe(true);
  });
});
