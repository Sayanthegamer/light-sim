/**
 * Branch Management & Fresnel Energy Culling Engine
 * Manages parent-child beam frustum trees, recursive dielectric splits,
 * relativistic curved spacetime geodesics, TIR bounds, and sub-threshold energy pruning.
 */

import { type IVec2 } from '../math/vec2';
import {
  type Ray2D,
  type Segment2D,
  type Arc2D,
  type HitResult,
  createHitResult,
  findClosestIntersection
} from './intersections';
import {
  solveRefraction,
  type RefractionResult,
  cauchyIndex,
  dispersionUToWavelength
} from '../optics/refraction';
import {
  type CornerVertex,
  hasDiscontinuity,
  bisectBoundaryDiscontinuity
} from './bisection';
import {
  type BlackHole,
  type GeodesicTrajectory,
  createGeodesicTrajectory,
  MAX_RK2_STEPS
} from '../physics/rk2Integrator';
import {
  intersectRayInfluenceBoundary,
  type BoundaryRayHandOff,
  traceGeodesicWithTermination,
  TerminationReason
} from '../physics/blackHoleBoundary';

export const MAX_BOUNCE_DEPTH = 8;
export const MIN_ENERGY_THRESHOLD = 0.005;
export const MAX_FRUSTUM_POOL = 1024;

export interface BeamFrustum {
  id: number;
  depth: number;
  leftRay: Ray2D;
  rightRay: Ray2D;
  leftHit: IVec2;
  rightHit: IVec2;
  intensity: number;
  dispersionU: number; // u in [0, 1], or -1.0 for un-dispersed/white
  tintRGB: [number, number, number]; // Normalized [0..255]
  isDispersed: boolean;
}

export function createBeamFrustum(): BeamFrustum {
  return {
    id: 0,
    depth: 0,
    leftRay: { origin: { x: 0, y: 0 }, dir: { x: 0, y: 0 } },
    rightRay: { origin: { x: 0, y: 0 }, dir: { x: 0, y: 0 } },
    leftHit: { x: 0, y: 0 },
    rightHit: { x: 0, y: 0 },
    intensity: 1.0,
    dispersionU: -1.0,
    tintRGB: [255, 255, 255],
    isDispersed: false
  };
}

export function copyBeamFrustum(dest: BeamFrustum, src: BeamFrustum): void {
  dest.id = src.id;
  dest.depth = src.depth;
  dest.leftRay.origin.x = src.leftRay.origin.x;
  dest.leftRay.origin.y = src.leftRay.origin.y;
  dest.leftRay.dir.x = src.leftRay.dir.x;
  dest.leftRay.dir.y = src.leftRay.dir.y;

  dest.rightRay.origin.x = src.rightRay.origin.x;
  dest.rightRay.origin.y = src.rightRay.origin.y;
  dest.rightRay.dir.x = src.rightRay.dir.x;
  dest.rightRay.dir.y = src.rightRay.dir.y;

  dest.leftHit.x = src.leftHit.x;
  dest.leftHit.y = src.leftHit.y;
  dest.rightHit.x = src.rightHit.x;
  dest.rightHit.y = src.rightHit.y;

  dest.intensity = src.intensity;
  dest.dispersionU = src.dispersionU;
  dest.tintRGB[0] = src.tintRGB[0];
  dest.tintRGB[1] = src.tintRGB[1];
  dest.tintRGB[2] = src.tintRGB[2];
  dest.isDispersed = src.isDispersed;
}

export type RibbonCallback = (
  trajL: GeodesicTrajectory,
  trajR: GeodesicTrajectory,
  frustum: BeamFrustum,
  bh: BlackHole
) => void;

export class BranchManager {
  private readonly frustumPool: BeamFrustum[];
  private poolCount = 0;
  private readonly leftHitResult: HitResult;
  private readonly rightHitResult: HitResult;
  private readonly leftRefractionResult: RefractionResult;
  private readonly rightRefractionResult: RefractionResult;

  // Reusable black hole integration structures (zero GC)
  private readonly reusableTrajL = createGeodesicTrajectory(MAX_RK2_STEPS);
  private readonly reusableTrajR = createGeodesicTrajectory(MAX_RK2_STEPS);
  private readonly reusableHandOffL: BoundaryRayHandOff = {
    hasIntersection: false,
    entryPoint: { x: 0, y: 0 },
    exitPoint: { x: 0, y: 0 },
    tEntry: 0,
    tExit: 0
  };
  private readonly reusableHandOffR: BoundaryRayHandOff = {
    hasIntersection: false,
    entryPoint: { x: 0, y: 0 },
    exitPoint: { x: 0, y: 0 },
    tEntry: 0,
    tExit: 0
  };

  constructor(poolCapacity = MAX_FRUSTUM_POOL) {
    this.frustumPool = [];
    for (let i = 0; i < poolCapacity; i++) {
      this.frustumPool.push(createBeamFrustum());
    }

    this.leftHitResult = createHitResult();
    this.rightHitResult = createHitResult();
    this.leftRefractionResult = {
      refractedDir: { x: 0, y: 0 },
      reflectedDir: { x: 0, y: 0 },
      R: 0,
      T: 0,
      isTIR: false
    };
    this.rightRefractionResult = {
      refractedDir: { x: 0, y: 0 },
      reflectedDir: { x: 0, y: 0 },
      R: 0,
      T: 0,
      isTIR: false
    };
  }

  /**
   * Resets pool allocation counter. Called once per frame solve.
   */
  resetPool(): void {
    this.poolCount = 0;
  }

  /**
   * Gets current count of allocated frustums in the pool.
   */
  getPoolCount(): number {
    return this.poolCount;
  }

  /**
   * Allocates a pre-allocated frustum from the pool without GC.
   * Returns null if pool capacity is exhausted, gracefully dropping sub-branches.
   */
  allocateFrustum(): BeamFrustum | null {
    if (this.poolCount >= this.frustumPool.length) {
      return null;
    }
    const frustum = this.frustumPool[this.poolCount];
    frustum.id = this.poolCount;
    this.poolCount++;
    return frustum;
  }

  /**
   * Determines whether a beam branch should be culled based on energy and bounce depth.
   */
  shouldCull(frustum: BeamFrustum): boolean {
    if (frustum.depth >= MAX_BOUNCE_DEPTH) {
      return true;
    }
    const maxTint = Math.max(frustum.tintRGB[0], frustum.tintRGB[1], frustum.tintRGB[2]) / 255.0;
    if (frustum.intensity * maxTint < MIN_ENERGY_THRESHOLD) {
      return true;
    }
    return false;
  }

  /**
   * Traces an entire light tree starting from an initial beam frustum across scene obstacles and black holes.
   * Handles non-Euclidean geodesic integration, curved ribbon meshes, and downstream ray continuation.
   */
  traceLightTree(
    initial: BeamFrustum,
    segments: readonly Segment2D[],
    arcs: readonly Arc2D[],
    corners: readonly CornerVertex[] = [],
    blackHoles: readonly BlackHole[] = [],
    onRibbon?: RibbonCallback,
    maxDistance = 2000
  ): BeamFrustum[] {
    const activeFrustums: BeamFrustum[] = [];

    // Queue of frustums to process
    const queue: BeamFrustum[] = [];

    // Allocate root from pool
    const root = this.allocateFrustum();
    if (!root) {
      return activeFrustums;
    }
    copyBeamFrustum(root, initial);
    queue.push(root);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (this.shouldCull(current)) {
        continue;
      }

      // Raycast left and right boundary rays
      const hasLeftHit = findClosestIntersection(
        this.leftHitResult,
        current.leftRay,
        segments,
        arcs
      );
      const hasRightHit = findClosestIntersection(
        this.rightHitResult,
        current.rightRay,
        segments,
        arcs
      );

      const distL = hasLeftHit ? this.leftHitResult.distance : maxDistance;
      const distR = hasRightHit ? this.rightHitResult.distance : maxDistance;

      // Check if frustum enters a black hole BEFORE reaching the obstacles
      let closestBH: BlackHole | null = null;
      let closestEntryDist = Infinity;
      let bhLeftEntry = { x: 0, y: 0 };
      let bhRightEntry = { x: 0, y: 0 };

      for (let b = 0; b < blackHoles.length; b++) {
        const bh = blackHoles[b];
        const hasLeftEntry = intersectRayInfluenceBoundary(this.reusableHandOffL, current.leftRay, bh);
        const hasRightEntry = intersectRayInfluenceBoundary(this.reusableHandOffR, current.rightRay, bh);

        if (hasLeftEntry && hasRightEntry) {
          if (
            this.reusableHandOffL.tEntry < distL &&
            this.reusableHandOffR.tEntry < distR &&
            this.reusableHandOffL.tEntry < closestEntryDist
          ) {
            closestBH = bh;
            closestEntryDist = this.reusableHandOffL.tEntry;
            bhLeftEntry.x = this.reusableHandOffL.entryPoint.x;
            bhLeftEntry.y = this.reusableHandOffL.entryPoint.y;
            bhRightEntry.x = this.reusableHandOffR.entryPoint.x;
            bhRightEntry.y = this.reusableHandOffR.entryPoint.y;
          }
        }
      }

      if (closestBH !== null) {
        // Light enters black hole influence boundary: clip the incoming straight beam
        current.leftHit.x = bhLeftEntry.x;
        current.leftHit.y = bhLeftEntry.y;
        current.rightHit.x = bhRightEntry.x;
        current.rightHit.y = bhRightEntry.y;

        activeFrustums.push(current);

        // Trace left and right geodesics using unified traceGeodesicWithTermination
        const resL = traceGeodesicWithTermination(
          this.reusableTrajL,
          { origin: bhLeftEntry, dir: current.leftRay.dir },
          closestBH
        );
        const resR = traceGeodesicWithTermination(
          this.reusableTrajR,
          { origin: bhRightEntry, dir: current.rightRay.dir },
          closestBH
        );

        // Emit curved ribbon mesh
        if (onRibbon && this.reusableTrajL.pointCount > 2 && this.reusableTrajR.pointCount > 2) {
          onRibbon(this.reusableTrajL, this.reusableTrajR, current, closestBH);
        }

        // Ray continuation: if both rays escape the gravity well, spawn an escaped downstream frustum
        if (
          resL.reason === TerminationReason.Escaped &&
          resR.reason === TerminationReason.Escaped &&
          resL.exitRay &&
          resR.exitRay &&
          current.depth + 1 < MAX_BOUNCE_DEPTH &&
          this.poolCount < this.frustumPool.length
        ) {
          const escapedChild = this.allocateFrustum();
          if (escapedChild) {
            escapedChild.depth = current.depth + 1;
            escapedChild.intensity = current.intensity;
            escapedChild.dispersionU = current.dispersionU;
            escapedChild.tintRGB[0] = current.tintRGB[0];
            escapedChild.tintRGB[1] = current.tintRGB[1];
            escapedChild.tintRGB[2] = current.tintRGB[2];
            escapedChild.isDispersed = current.isDispersed;

            escapedChild.leftRay.origin.x = resL.exitRay.origin.x;
            escapedChild.leftRay.origin.y = resL.exitRay.origin.y;
            escapedChild.leftRay.dir.x = resL.exitRay.dir.x;
            escapedChild.leftRay.dir.y = resL.exitRay.dir.y;

            escapedChild.rightRay.origin.x = resR.exitRay.origin.x;
            escapedChild.rightRay.origin.y = resR.exitRay.origin.y;
            escapedChild.rightRay.dir.x = resR.exitRay.dir.x;
            escapedChild.rightRay.dir.y = resR.exitRay.dir.y;

            queue.push(escapedChild);
          }
        }

        // Black hole absorbed/deflected the beam; do not continue straight into occluded obstacle
        continue;
      }

      // Check for geometric/corner discontinuity between boundary rays
      if (
        hasDiscontinuity(this.leftHitResult, this.rightHitResult) &&
        corners.length > 0 &&
        current.depth < MAX_BOUNCE_DEPTH &&
        this.poolCount + 2 <= this.frustumPool.length
      ) {
        const split = bisectBoundaryDiscontinuity(
          { u: 0.0, ray: current.leftRay },
          { u: 1.0, ray: current.rightRay },
          segments,
          arcs,
          corners,
          5,
          0.5
        );

        if (split.uSplit > 0.02 && split.uSplit < 0.98) {
          const leftChild = this.allocateFrustum();
          const rightChild = this.allocateFrustum();

          if (leftChild && rightChild) {
            // Spawn Left Sub-Frustum [leftRay -> splitRay]
            copyBeamFrustum(leftChild, current);
            leftChild.rightRay.origin.x = split.splitRay.origin.x;
            leftChild.rightRay.origin.y = split.splitRay.origin.y;
            leftChild.rightRay.dir.x = split.splitRay.dir.x;
            leftChild.rightRay.dir.y = split.splitRay.dir.y;
            queue.push(leftChild);

            // Spawn Right Sub-Frustum [splitRay -> rightRay]
            copyBeamFrustum(rightChild, current);
            rightChild.leftRay.origin.x = split.splitRay.origin.x;
            rightChild.leftRay.origin.y = split.splitRay.origin.y;
            rightChild.leftRay.dir.x = split.splitRay.dir.x;
            rightChild.leftRay.dir.y = split.splitRay.dir.y;
            queue.push(rightChild);

            continue;
          }
        }
      }

      activeFrustums.push(current);

      // Set boundary hit endpoints
      if (hasLeftHit) {
        current.leftHit.x = this.leftHitResult.point.x;
        current.leftHit.y = this.leftHitResult.point.y;
      } else {
        current.leftHit.x = current.leftRay.origin.x + current.leftRay.dir.x * maxDistance;
        current.leftHit.y = current.leftRay.origin.y + current.leftRay.dir.y * maxDistance;
      }

      if (hasRightHit) {
        current.rightHit.x = this.rightHitResult.point.x;
        current.rightHit.y = this.rightHitResult.point.y;
      } else {
        current.rightHit.x = current.rightRay.origin.x + current.rightRay.dir.x * maxDistance;
        current.rightHit.y = current.rightRay.origin.y + current.rightRay.dir.y * maxDistance;
      }

      // If neither hit, beam continues into void and terminates
      if (!hasLeftHit && !hasRightHit) {
        continue;
      }

      // If either hit an opaque barrier, do not spawn children
      if (
        (hasLeftHit && this.leftHitResult.isBarrier) ||
        (hasRightHit && this.rightHitResult.isBarrier)
      ) {
        continue;
      }

      // Calculate refractive indices (with Cauchy dispersion if spectral)
      let leftN1 = hasLeftHit ? this.leftHitResult.n1 : 1.0;
      let leftN2 = hasLeftHit ? this.leftHitResult.n2 : 1.0;
      let rightN1 = hasRightHit ? this.rightHitResult.n1 : 1.0;
      let rightN2 = hasRightHit ? this.rightHitResult.n2 : 1.0;

      if (current.dispersionU >= 0) {
        const wl = dispersionUToWavelength(current.dispersionU);
        if (hasLeftHit && this.leftHitResult.cauchyB > 0) {
          leftN2 = cauchyIndex(wl, this.leftHitResult.cauchyA, this.leftHitResult.cauchyB);
        }
        if (hasRightHit && this.rightHitResult.cauchyB > 0) {
          rightN2 = cauchyIndex(wl, this.rightHitResult.cauchyA, this.rightHitResult.cauchyB);
        }
      }

      const primaryHit = hasLeftHit ? this.leftHitResult : this.rightHitResult;

      if (primaryHit.isMirror) {
        // Ideal specular mirror: 100% reflection with independent left/right normals
        if (current.depth + 1 < MAX_BOUNCE_DEPTH && this.poolCount < this.frustumPool.length) {
          if (hasLeftHit) {
            solveRefraction(
              this.leftRefractionResult,
              current.leftRay.dir,
              this.leftHitResult.normal,
              1.0,
              1.0
            );
          }
          if (hasRightHit) {
            solveRefraction(
              this.rightRefractionResult,
              current.rightRay.dir,
              this.rightHitResult.normal,
              1.0,
              1.0
            );
          } else {
            this.rightRefractionResult.reflectedDir.x = this.leftRefractionResult.reflectedDir.x;
            this.rightRefractionResult.reflectedDir.y = this.leftRefractionResult.reflectedDir.y;
          }
          if (!hasLeftHit) {
            this.leftRefractionResult.reflectedDir.x = this.rightRefractionResult.reflectedDir.x;
            this.leftRefractionResult.reflectedDir.y = this.rightRefractionResult.reflectedDir.y;
          }

          const mirrorChild = this.allocateFrustum();
          if (mirrorChild) {
            mirrorChild.depth = current.depth + 1;
            mirrorChild.intensity = current.intensity;
            mirrorChild.dispersionU = current.dispersionU;
            mirrorChild.tintRGB[0] = current.tintRGB[0];
            mirrorChild.tintRGB[1] = current.tintRGB[1];
            mirrorChild.tintRGB[2] = current.tintRGB[2];
            mirrorChild.isDispersed = current.isDispersed;

            mirrorChild.leftRay.origin.x = current.leftHit.x;
            mirrorChild.leftRay.origin.y = current.leftHit.y;
            mirrorChild.leftRay.dir.x = this.leftRefractionResult.reflectedDir.x;
            mirrorChild.leftRay.dir.y = this.leftRefractionResult.reflectedDir.y;

            mirrorChild.rightRay.origin.x = current.rightHit.x;
            mirrorChild.rightRay.origin.y = current.rightHit.y;
            mirrorChild.rightRay.dir.x = this.rightRefractionResult.reflectedDir.x;
            mirrorChild.rightRay.dir.y = this.rightRefractionResult.reflectedDir.y;

            queue.push(mirrorChild);
          }
        }
        continue;
      }

      // Dielectric interface (e.g. Glass, Lens, Prism) - independent refraction on both sides
      if (hasLeftHit) {
        solveRefraction(
          this.leftRefractionResult,
          current.leftRay.dir,
          this.leftHitResult.normal,
          leftN1,
          leftN2
        );
      }
      if (hasRightHit) {
        solveRefraction(
          this.rightRefractionResult,
          current.rightRay.dir,
          this.rightHitResult.normal,
          rightN1,
          rightN2
        );
      } else {
        this.rightRefractionResult.refractedDir.x = this.leftRefractionResult.refractedDir.x;
        this.rightRefractionResult.refractedDir.y = this.leftRefractionResult.refractedDir.y;
        this.rightRefractionResult.reflectedDir.x = this.leftRefractionResult.reflectedDir.x;
        this.rightRefractionResult.reflectedDir.y = this.leftRefractionResult.reflectedDir.y;
        this.rightRefractionResult.R = this.leftRefractionResult.R;
        this.rightRefractionResult.T = this.leftRefractionResult.T;
        this.rightRefractionResult.isTIR = this.leftRefractionResult.isTIR;
      }
      if (!hasLeftHit) {
        this.leftRefractionResult.refractedDir.x = this.rightRefractionResult.refractedDir.x;
        this.leftRefractionResult.refractedDir.y = this.rightRefractionResult.refractedDir.y;
        this.leftRefractionResult.reflectedDir.x = this.rightRefractionResult.reflectedDir.x;
        this.leftRefractionResult.reflectedDir.y = this.rightRefractionResult.reflectedDir.y;
        this.leftRefractionResult.R = this.rightRefractionResult.R;
        this.leftRefractionResult.T = this.rightRefractionResult.T;
        this.leftRefractionResult.isTIR = this.rightRefractionResult.isTIR;
      }

      const avgR = 0.5 * (this.leftRefractionResult.R + this.rightRefractionResult.R);
      const avgT = 0.5 * (this.leftRefractionResult.T + this.rightRefractionResult.T);
      const isTIR = this.leftRefractionResult.isTIR && this.rightRefractionResult.isTIR;

      // 1. Reflected Child (Fresnel reflection)
      if (
        avgR * current.intensity >= MIN_ENERGY_THRESHOLD &&
        current.depth + 1 < MAX_BOUNCE_DEPTH &&
        this.poolCount < this.frustumPool.length
      ) {
        const reflectedChild = this.allocateFrustum();
        if (reflectedChild) {
          reflectedChild.depth = current.depth + 1;
          reflectedChild.intensity = current.intensity * avgR;
          reflectedChild.dispersionU = current.dispersionU;
          reflectedChild.tintRGB[0] = current.tintRGB[0];
          reflectedChild.tintRGB[1] = current.tintRGB[1];
          reflectedChild.tintRGB[2] = current.tintRGB[2];
          reflectedChild.isDispersed = current.isDispersed;

          reflectedChild.leftRay.origin.x = current.leftHit.x;
          reflectedChild.leftRay.origin.y = current.leftHit.y;
          reflectedChild.leftRay.dir.x = this.leftRefractionResult.reflectedDir.x;
          reflectedChild.leftRay.dir.y = this.leftRefractionResult.reflectedDir.y;

          reflectedChild.rightRay.origin.x = current.rightHit.x;
          reflectedChild.rightRay.origin.y = current.rightHit.y;
          reflectedChild.rightRay.dir.x = this.rightRefractionResult.reflectedDir.x;
          reflectedChild.rightRay.dir.y = this.rightRefractionResult.reflectedDir.y;

          queue.push(reflectedChild);
        }
      }

      // 2. Transmitted Child (Snell refraction, if not Total Internal Reflection)
      if (
        !isTIR &&
        avgT * current.intensity >= MIN_ENERGY_THRESHOLD &&
        current.depth + 1 < MAX_BOUNCE_DEPTH &&
        this.poolCount < this.frustumPool.length
      ) {
        const transmittedChild = this.allocateFrustum();
        if (transmittedChild) {
          transmittedChild.depth = current.depth + 1;
          transmittedChild.intensity = current.intensity * avgT;
          transmittedChild.dispersionU = current.dispersionU;
          transmittedChild.tintRGB[0] = current.tintRGB[0];
          transmittedChild.tintRGB[1] = current.tintRGB[1];
          transmittedChild.tintRGB[2] = current.tintRGB[2];
          transmittedChild.isDispersed = current.isDispersed;

          transmittedChild.leftRay.origin.x = current.leftHit.x;
          transmittedChild.leftRay.origin.y = current.leftHit.y;
          transmittedChild.leftRay.dir.x = this.leftRefractionResult.refractedDir.x;
          transmittedChild.leftRay.dir.y = this.leftRefractionResult.refractedDir.y;

          transmittedChild.rightRay.origin.x = current.rightHit.x;
          transmittedChild.rightRay.origin.y = current.rightHit.y;
          transmittedChild.rightRay.dir.x = this.rightRefractionResult.refractedDir.x;
          transmittedChild.rightRay.dir.y = this.rightRefractionResult.refractedDir.y;

          queue.push(transmittedChild);
        }
      }
    }

    return activeFrustums;
  }
}
