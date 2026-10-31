/**
 * Monte Carlo Bidirectional Photon / Wave Transport Kernel
 *
 * Implements physical continuous spectral photon transport, volumetric in-scattering,
 * curved Schwarzschild relativistic geodesics, exact Sellmeier/Cauchy Fresnel refraction,
 * Russian Roulette stochastic branching, and 32-bit float accumulation target splatting.
 */

import { type IVec2, smoothstep, clamp } from '../math/vec2';
import {
  type Segment2D,
  type Arc2D,
  type HitResult,
  type Ray2D,
  createHitResult,
  findClosestIntersection
} from '../geometry/intersections';
import {
  evaluateSellmeierIndex,
  wavelengthSampleToXYZInto,
  type IXyzColor
} from './spectralSampler';
import {
  type IVolumeMedium,
  sampleFreeFlightDistance,
  sampleScatteringDirection2D
} from './volumetricMedium';
import { advanceWavePhase } from './waveOptics';
import { AccumulationTarget } from './accumulationTarget';
import { solveRefraction, cauchyIndex, type RefractionResult } from '../optics/refraction';

export interface IOfflinePrism {
  id: number;
  vertices: IVec2[];
  glass?: string;
  n?: number;
  cauchyA?: number;
  cauchyB?: number;
}

export interface IOfflineLens {
  id: number;
  arcs: Arc2D[];
  segments?: Segment2D[];
  glass?: string;
  n?: number;
  cauchyA?: number;
  cauchyB?: number;
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

export interface IResolvedScenePrimitives {
  segments: readonly Segment2D[];
  arcs: readonly Arc2D[];
}

export interface ITracerScratchContext {
  hit: HitResult;
  refrResult: RefractionResult;
  ray: Ray2D;
  inDir: IVec2;
  sampleXYZ: IXyzColor;
}

export function createTracerScratchContext(): ITracerScratchContext {
  return {
    hit: createHitResult(),
    refrResult: {
      refractedDir: { x: 0, y: 0 },
      reflectedDir: { x: 0, y: 0 },
      R: 0,
      T: 0,
      isTIR: false
    },
    ray: {
      origin: { x: 0, y: 0 },
      dir: { x: 0, y: 0 }
    },
    inDir: { x: 0, y: 0 },
    sampleXYZ: { x: 0, y: 0, z: 0 }
  };
}

export interface ITracerOptions {
  maxBounces?: number;
  russianRouletteThreshold?: number;
  volumetricInScatter?: boolean;
  primitives?: IResolvedScenePrimitives;
  scratch?: ITracerScratchContext;
  photonWeight?: number;
}

/**
 * Extracts flat segments and circular arcs from scene objects.
 */
export function extractScenePrimitives(scene: IOfflineSceneGeometry): IResolvedScenePrimitives {
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
    const cauchyB = p.cauchyB ?? 4200;
    const effB = cauchyB > 0 && cauchyB < 1.0 ? cauchyB * 1e6 : cauchyB;
    const cauchyA = p.cauchyA ?? (nGlass - effB / (587.6 * 587.6));
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
        cauchyA,
        cauchyB: effB
      });
    }
  }

  // 3. Lenses
  for (let i = 0; i < scene.lenses.length; i++) {
    const l = scene.lenses[i];
    for (let j = 0; j < l.arcs.length; j++) {
      arcs.push(l.arcs[j]);
    }
    if (l.segments) {
      for (let j = 0; j < l.segments.length; j++) {
        segments.push(l.segments[j]);
      }
    }
  }

  return { segments, arcs };
}

const defaultScratch = createTracerScratchContext();

/**
 * Traces a single photon wave packet through the scene using Russian Roulette Monte Carlo transport.
 */
export function tracePhotonPath(
  photon: IPhotonState,
  scene: IOfflineSceneGeometry,
  target: AccumulationTarget,
  options?: ITracerOptions
): IPhotonTraceStats {
  const maxBounces = options?.maxBounces ?? 64;
  const enableVolumetrics = options?.volumetricInScatter ?? true;
  const photonWeight = options?.photonWeight ?? 0.01;

  const precomputed = options?.primitives ?? extractScenePrimitives(scene);
  const segments = precomputed.segments;
  const arcs = precomputed.arcs;

  const scratch = options?.scratch ?? defaultScratch;
  const hit = scratch.hit;
  const refrResult = scratch.refrResult;
  const scratchRay = scratch.ray;
  const scratchInDir = scratch.inDir;
  const sampleXYZ = scratch.sampleXYZ;

  let curX = photon.pos.x;
  let curY = photon.pos.y;
  let dirX = photon.dir.x;
  let dirY = photon.dir.y;
  let energy = photon.energy;
  let phase = photon.phase;
  const wl = photon.wavelengthNm;

  let bounces = 0;
  let geodesicSteps = 0;
  let scattered = false;
  let absorbed = false;

  const b = scene.bounds;
  const medium = scene.medium;
  const blackHoles = scene.blackHoles;
  const numBH = blackHoles ? blackHoles.length : 0;

  while (bounces < maxBounces && geodesicSteps < 256 && energy > 1e-4) {
    // 1. Find geometric collision
    scratchRay.origin.x = curX;
    scratchRay.origin.y = curY;
    scratchRay.dir.x = dirX;
    scratchRay.dir.y = dirY;
    const hasHit = findClosestIntersection(hit, scratchRay, segments, arcs);
    let dist = hasHit ? hit.t : 2000.0;

    // Boundary distance check
    let boundDist = Infinity;
    if (dirX > 1e-6) boundDist = Math.min(boundDist, (b.maxX - curX) / dirX);
    else if (dirX < -1e-6) boundDist = Math.min(boundDist, (b.minX - curX) / dirX);
    if (dirY > 1e-6) boundDist = Math.min(boundDist, (b.maxY - curY) / dirY);
    else if (dirY < -1e-6) boundDist = Math.min(boundDist, (b.minY - curY) / dirY);

    if (boundDist > 0 && boundDist < dist) {
      dist = boundDist;
    }

    // 1.5. Check Black Hole Gravitational Field Intersection / Stepping
    let activeBh: IOfflineBlackHole | null = null;
    let bhEntryT = dist;

    if (numBH > 0) {
      for (let bi = 0; bi < numBH; bi++) {
        const bh = blackHoles[bi];
        const ocX = curX - bh.center.x;
        const ocY = curY - bh.center.y;
        const rSq = ocX * ocX + ocY * ocY;
        const rInf = bh.rInfluence;

        if (rSq < (rInf - 1e-2) * (rInf - 1e-2)) {
          activeBh = bh;
          bhEntryT = 0;
          break;
        } else {
          const halfB = ocX * dirX + ocY * dirY;
          const cVal = rSq - rInf * rInf;
          const disc = halfB * halfB - cVal;
          if (disc > 0) {
            const tEnter = -halfB - Math.sqrt(disc);
            if (tEnter > 1e-3 && tEnter < bhEntryT) {
              bhEntryT = tEnter;
              activeBh = bh;
            } else if (rSq <= (rInf + 1e-2) * (rInf + 1e-2) && halfB < 0) {
              bhEntryT = 0;
              activeBh = bh;
              break;
            }
          }
        }
      }
    }

    // If photon is inside a black hole's influence radius, integrate curved Schwarzschild geodesic step
    if (activeBh !== null && bhEntryT <= 1e-3) {
      const rx = curX - activeBh.center.x;
      const ry = curY - activeBh.center.y;
      const rSq = rx * rx + ry * ry;
      const r = Math.sqrt(rSq);
      const rs = activeBh.rs;

      if (r <= rs) {
        absorbed = true;
        break;
      }

      const stepDt = Math.min(dist, clamp(0.25 * r, Math.max(1.0, 0.2 * rs), 20.0));
      const rFadeStart = 10.0 * rs;
      const fade = r > rFadeStart ? smoothstep(activeBh.rInfluence, rFadeStart, r) : 1.0;
      const mag1 = -(2.25 * rs * fade) / (rSq * r);
      const acc1X = rx * mag1;
      const acc1Y = ry * mag1;

      const midX = curX + dirX * (0.5 * stepDt) + acc1X * (0.25 * stepDt * stepDt);
      const midY = curY + dirY * (0.5 * stepDt) + acc1Y * (0.25 * stepDt * stepDt);
      const mrx = midX - activeBh.center.x;
      const mry = midY - activeBh.center.y;
      const mrSq = mrx * mrx + mry * mry;
      const mr = Math.sqrt(mrSq);

      if (mr <= rs) {
        absorbed = true;
        break;
      }

      const mFade = mr > rFadeStart ? smoothstep(activeBh.rInfluence, rFadeStart, mr) : 1.0;
      const mag2 = -(2.25 * rs * mFade) / (mrSq * mr);
      const acc2X = mrx * mag2;
      const acc2Y = mry * mag2;

      const nextX = curX + dirX * stepDt + acc1X * (0.5 * stepDt * stepDt);
      const nextY = curY + dirY * stepDt + acc1Y * (0.5 * stepDt * stepDt);
      let nextDirX = dirX + acc2X * stepDt;
      let nextDirY = dirY + acc2Y * stepDt;
      const dLen = Math.hypot(nextDirX, nextDirY) || 1.0;
      nextDirX /= dLen;
      nextDirY /= dLen;

      const nextR = Math.hypot(nextX - activeBh.center.x, nextY - activeBh.center.y);
      const redshift = 1.0 / Math.sqrt(Math.max(0.01, 1.0 - rs / Math.max(rs * 1.001, nextR)));
      const shiftedWl = wl * clamp(redshift, 1.0, 1.35);

      wavelengthSampleToXYZInto(sampleXYZ, shiftedWl, energy * photonWeight);
      target.splatLine(curX, curY, nextX, nextY, sampleXYZ, 1.0);

      curX = nextX;
      curY = nextY;
      dirX = nextDirX;
      dirY = nextDirY;
      geodesicSteps++;

      if (nextR <= rs) {
        absorbed = true;
        break;
      }
      continue;
    }

    let entersBhBoundary = false;
    if (activeBh !== null && bhEntryT < dist) {
      dist = bhEntryT;
      entersBhBoundary = true;
    }

    // 2. Volumetric in-scattering check
    let didScatter = false;
    if (enableVolumetrics && medium && medium.sigmaT > 1e-6) {
      const scatterDist = sampleFreeFlightDistance(medium.sigmaT, Math.random());
      if (scatterDist < dist) {
        dist = scatterDist;
        didScatter = true;
        entersBhBoundary = false;
      }
    }

    // Advance path
    const nextX = curX + dirX * dist;
    const nextY = curY + dirY * dist;

    // Splat path into accumulation target (uniform per-pixel irradiance)
    wavelengthSampleToXYZInto(sampleXYZ, wl, energy * photonWeight);
    target.splatLine(curX, curY, nextX, nextY, sampleXYZ, 1.0);

    phase = advanceWavePhase(phase, dist, wl);
    curX = nextX;
    curY = nextY;

    if (entersBhBoundary) {
      curX += dirX * 0.05;
      curY += dirY * 0.05;
      geodesicSteps++;
      continue;
    }

    if (didScatter && medium) {
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
      curX += hit.normal.x * 2e-3;
      curY += hit.normal.y * 2e-3;
      continue;
    }

    // Dielectric interface (Refraction + Reflection with continuous Sellmeier/Cauchy dispersion)
    const n1 = hit.n1 <= 1.05 ? 1.0 : cauchyIndex(wl, hit.cauchyA, hit.cauchyB);
    const n2 = hit.n2 <= 1.05 ? 1.0 : cauchyIndex(wl, hit.cauchyA, hit.cauchyB);

    scratchInDir.x = dirX;
    scratchInDir.y = dirY;
    solveRefraction(refrResult, scratchInDir, hit.normal, n1, n2);

    // Russian Roulette branching
    const xi = Math.random();
    if (refrResult.isTIR || xi < refrResult.R) {
      // Reflect
      dirX = refrResult.reflectedDir.x;
      dirY = refrResult.reflectedDir.y;
      curX += hit.normal.x * 2e-3;
      curY += hit.normal.y * 2e-3;
    } else {
      // Transmit
      dirX = refrResult.refractedDir.x;
      dirY = refrResult.refractedDir.y;
      curX -= hit.normal.x * 2e-3;
      curY -= hit.normal.y * 2e-3;
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
