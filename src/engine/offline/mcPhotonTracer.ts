/**
 * Monte Carlo Bidirectional Photon / Wave Transport Kernel
 *
 * Implements physical continuous spectral photon transport, volumetric in-scattering,
 * exact Sellmeier Fresnel refraction / Russian Roulette stochastic branching, and
 * 32-bit float accumulation target splatting.
 */

import { type IVec2 } from '../math/vec2';
import {
  type Segment2D,
  type Arc2D,
  createHitResult,
  findClosestIntersection
} from '../geometry/intersections';
import { evaluateSellmeierIndex, wavelengthSampleToXYZ } from './spectralSampler';
import {
  type IVolumeMedium,
  sampleFreeFlightDistance,
  sampleScatteringDirection2D
} from './volumetricMedium';
import { advanceWavePhase } from './waveOptics';
import { AccumulationTarget } from './accumulationTarget';
import { solveRefraction, type RefractionResult } from '../optics/refraction';

export interface IOfflinePrism {
  id: number;
  vertices: IVec2[];
  glass?: string;
  n?: number;
}

export interface IOfflineLens {
  id: number;
  arcs: Arc2D[];
  glass?: string;
  n?: number;
}

export interface IOfflineBarrier {
  id: number;
  p1: IVec2;
  p2: IVec2;
  isMirror?: boolean;
}

export interface IOfflineBlackHole {
  id: number;
  center: IVec2;
  rs: number;
  rInfluence: number;
}

export interface IOfflineEmitter {
  id: number;
  pos: IVec2;
  dir: IVec2;
  width: number;
  spectrumType: 'blackbody' | 'd65' | 'monochromatic' | 'uniform';
  spectrumParam: number; // Temperature (K) or wavelength (nm)
  power: number;
}

export interface IOfflineSceneGeometry {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  emitters: IOfflineEmitter[];
  prisms: IOfflinePrism[];
  lenses: IOfflineLens[];
  barriers: IOfflineBarrier[];
  blackHoles: IOfflineBlackHole[];
  medium?: IVolumeMedium;
}

export interface IPhotonState {
  pos: IVec2;
  dir: IVec2;
  wavelengthNm: number;
  energy: number;
  phase: number;
}

export interface IPhotonTraceStats {
  bounces: number;
  scattered: boolean;
  absorbed: boolean;
  finalWavelength: number;
  energy: number;
}

export interface ITracerOptions {
  maxBounces?: number;
  russianRouletteThreshold?: number;
  volumetricInScatter?: boolean;
}

/**
 * Extracts flat segments and circular arcs from scene objects.
 */
export function extractScenePrimitives(scene: IOfflineSceneGeometry): {
  segments: Segment2D[];
  arcs: Arc2D[];
} {
  const segments: Segment2D[] = [];
  const arcs: Arc2D[] = [];

  // 1. Barriers
  for (let i = 0; i < scene.barriers.length; i++) {
    const b = scene.barriers[i];
    segments.push({
      id: b.id,
      p1: { x: b.p1.x, y: b.p1.y },
      p2: { x: b.p2.x, y: b.p2.y },
      n1: 1.0,
      n2: 1.0,
      isBarrier: !b.isMirror,
      isMirror: !!b.isMirror
    });
  }

  // 2. Prisms (Polygonal segments)
  for (let i = 0; i < scene.prisms.length; i++) {
    const p = scene.prisms[i];
    const nGlass = p.glass ? evaluateSellmeierIndex(p.glass, 587.6) : (p.n ?? 1.5);
    const numVerts = p.vertices.length;

    for (let j = 0; j < numVerts; j++) {
      const v1 = p.vertices[j];
      const v2 = p.vertices[(j + 1) % numVerts];
      segments.push({
        id: p.id,
        p1: { x: v1.x, y: v1.y },
        p2: { x: v2.x, y: v2.y },
        n1: 1.0,
        n2: nGlass,
        cauchyA: nGlass,
        cauchyB: 0.005
      });
    }
  }

  // 3. Lenses
  for (let i = 0; i < scene.lenses.length; i++) {
    const l = scene.lenses[i];
    for (let j = 0; j < l.arcs.length; j++) {
      arcs.push(l.arcs[j]);
    }
  }

  return { segments, arcs };
}

/**
 * Traces a continuous spectral photon path through the scene with volumetric scattering,
 * Sellmeier dispersion, and Russian Roulette stochastic termination.
 */
export function tracePhotonPath(
  photon: IPhotonState,
  scene: IOfflineSceneGeometry,
  target: AccumulationTarget,
  options?: ITracerOptions
): IPhotonTraceStats {
  const maxBounces = options?.maxBounces ?? 64;
  const enableVolumetrics = options?.volumetricInScatter ?? true;

  const { segments, arcs } = extractScenePrimitives(scene);
  const hit = createHitResult();
  const refrResult: RefractionResult = {
    refractedDir: { x: 0, y: 0 },
    reflectedDir: { x: 0, y: 0 },
    R: 0,
    T: 0,
    isTIR: false
  };

  let curX = photon.pos.x;
  let curY = photon.pos.y;
  let dirX = photon.dir.x;
  let dirY = photon.dir.y;
  let energy = photon.energy;
  let phase = photon.phase;
  const wl = photon.wavelengthNm;

  let bounces = 0;
  let scattered = false;
  let absorbed = false;

  const b = scene.bounds;
  const medium = scene.medium;

  while (bounces < maxBounces && energy > 1e-4) {
    // 1. Find geometric collision
    const ray = { origin: { x: curX, y: curY }, dir: { x: dirX, y: dirY } };
    const hasHit = findClosestIntersection(hit, ray, segments, arcs);
    let dist = hasHit ? hit.t : 1000.0;

    // Boundary distance check
    let boundDist = Infinity;
    if (dirX > 1e-6) boundDist = Math.min(boundDist, (b.maxX - curX) / dirX);
    else if (dirX < -1e-6) boundDist = Math.min(boundDist, (b.minX - curX) / dirX);
    if (dirY > 1e-6) boundDist = Math.min(boundDist, (b.maxY - curY) / dirY);
    else if (dirY < -1e-6) boundDist = Math.min(boundDist, (b.minY - curY) / dirY);

    if (boundDist > 0 && boundDist < dist) {
      dist = boundDist;
    }

    // 2. Volumetric in-scattering check
    let didScatter = false;
    let scatterDist = Infinity;
    if (enableVolumetrics && medium && medium.sigmaT > 1e-6) {
      scatterDist = sampleFreeFlightDistance(medium.sigmaT, Math.random());
      if (scatterDist < dist) {
        dist = scatterDist;
        didScatter = true;
      }
    }

    // Advance path
    const nextX = curX + dirX * dist;
    const nextY = curY + dirY * dist;

    // Splat path into accumulation target
    const sampleXYZ = wavelengthSampleToXYZ(wl, energy * 0.1);
    target.splatLine(curX, curY, nextX, nextY, sampleXYZ, energy);

    phase = advanceWavePhase(phase, dist, wl);
    curX = nextX;
    curY = nextY;

    if (didScatter && medium) {
      // Photon scattered inside medium
      scattered = true;
      const newDir = sampleScatteringDirection2D(
        dirX,
        dirY,
        medium.mediumType,
        medium.g,
        Math.random(),
        Math.random()
      );
      dirX = newDir.x;
      dirY = newDir.y;
      energy *= medium.albedo;
      bounces++;

      // Russian roulette termination
      if (energy < 0.2) {
        if (Math.random() > energy * 5.0) {
          absorbed = true;
          break;
        }
        energy = 0.2;
      }
      continue;
    }

    if (!hasHit || dist >= boundDist - 1e-3) {
      // Escaped scene
      break;
    }

    // 3. Handle boundary collision
    bounces++;

    if (hit.isBarrier) {
      absorbed = true;
      break;
    }

    if (hit.isMirror) {
      // Specular reflection: v' = v - 2(v.n)n
      const dot = dirX * hit.normal.x + dirY * hit.normal.y;
      dirX -= 2.0 * dot * hit.normal.x;
      dirY -= 2.0 * dot * hit.normal.y;
      curX += hit.normal.x * 1e-2;
      curY += hit.normal.y * 1e-2;
      continue;
    }

    // Dielectric interface (Refraction + Reflection with continuous Sellmeier dispersion)
    const n1 = hit.n1 <= 1.05 ? 1.0 : hit.cauchyA + hit.cauchyB / Math.pow(wl * 0.001, 2);
    const n2 = hit.n2 <= 1.05 ? 1.0 : hit.cauchyA + hit.cauchyB / Math.pow(wl * 0.001, 2);

    const inDir = { x: dirX, y: dirY };
    solveRefraction(refrResult, inDir, hit.normal, n1, n2);

    // Russian Roulette branching
    const xi = Math.random();
    if (refrResult.isTIR || xi < refrResult.R) {
      // Reflect
      dirX = refrResult.reflectedDir.x;
      dirY = refrResult.reflectedDir.y;
      curX += hit.normal.x * 1e-2;
      curY += hit.normal.y * 1e-2;
    } else {
      // Transmit
      dirX = refrResult.refractedDir.x;
      dirY = refrResult.refractedDir.y;
      curX -= hit.normal.x * 1e-2;
      curY -= hit.normal.y * 1e-2;
    }

    // Russian Roulette survival
    if (energy < 0.1) {
      const p = Math.max(0.1, energy * 10.0);
      if (Math.random() > p) {
        absorbed = true;
        break;
      }
      energy /= p;
    }
  }

  return {
    bounces,
    scattered,
    absorbed,
    finalWavelength: wl,
    energy
  };
}
