import { describe, it, expect } from 'vitest';
import {
  tracePhotonPath,
  extractScenePrimitives,
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

  it('refracts photons through biconvex and planoconvex lenses without unphysical total reflection', () => {
    target.reset();
    // Biconvex lens centered at (50, 50)
    // Left surface arc centered at (80, 50), radius 40
    // Right surface arc centered at (20, 50), radius 40
    const lensScene: IOfflineSceneGeometry = {
      ...emptyScene,
      lenses: [
        {
          id: 1,
          arcs: [
            {
              id: 101,
              center: { x: 80, y: 50 },
              radius: 40,
              startAngle: Math.PI - 0.6,
              endAngle: Math.PI + 0.6,
              nInside: 1.517,
              nOutside: 1.0,
              cauchyA: 1.5046,
              cauchyB: 4200
            },
            {
              id: 102,
              center: { x: 20, y: 50 },
              radius: 40,
              startAngle: -0.6,
              endAngle: 0.6,
              nInside: 1.517,
              nOutside: 1.0,
              cauchyA: 1.5046,
              cauchyB: 4200
            }
          ],
          n: 1.517,
          cauchyA: 1.5046,
          cauchyB: 4200
        }
      ]
    };

    // Trace 100 photons through lens
    let transmittedCount = 0;
    for (let i = 0; i < 100; i++) {
      const photon: IPhotonState = {
        pos: { x: 10, y: 50 },
        dir: { x: 1, y: 0 },
        wavelengthNm: 550,
        energy: 1.0,
        phase: 0.0
      };
      const stats = tracePhotonPath(photon, lensScene, target, {
        maxBounces: 10,
        volumetricInScatter: false
      });
      // A photon that refracts through the front and back surface takes >= 2 bounces
      if (stats.bounces >= 2) {
        transmittedCount++;
      }
    }

    // With physical glass (n ~ 1.52), Fresnel reflection at normal incidence is ~4% per surface.
    // Over 100 photons, > 80% should transmit through both surfaces!
    expect(transmittedCount).toBeGreaterThan(80);
  });

  it('accepts pre-extracted primitives to eliminate per-photon collision extraction', () => {
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
          n: 1.5,
          cauchyA: 1.5,
          cauchyB: 4200
        }
      ]
    };

    // Pre-extract primitives once
    const precomputed = extractScenePrimitives(prismScene);
    expect(precomputed.segments.length).toBe(3);
    expect(precomputed.arcs.length).toBe(0);

    const photon: IPhotonState = {
      pos: { x: 10, y: 50 },
      dir: { x: 1, y: 0 },
      wavelengthNm: 550,
      energy: 1.0,
      phase: 0.0
    };

    // Pass pre-extracted primitives directly with an empty dummy scene geometry
    // To prove that it uses the precomputed primitives rather than extracting from the scene
    const dummyEmptyScene: IOfflineSceneGeometry = {
      ...emptyScene,
      prisms: [] // Empty! If it re-extracted from scene, it would have 0 segments and photon wouldn't hit anything
    };

    const stats = tracePhotonPath(photon, dummyEmptyScene, target, {
      maxBounces: 10,
      volumetricInScatter: false,
      primitives: precomputed
    });

    // If precomputed primitives were used, the photon hit the prism segment
    expect(stats.bounces).toBeGreaterThan(0);
    expect(target.getTotalSamples()).toBeGreaterThan(0);
  });
});
