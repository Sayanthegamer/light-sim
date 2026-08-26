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
export const INITIAL_FRUSTUM_POOL_CAPACITY = 1024;
export const MAX_FRUSTUM_POOL = INITIAL_FRUSTUM_POOL_CAPACITY; // Alias for backward compatibility
export const MAX_DYNAMIC_POOL_CAPACITY = 8192;

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

// Module-level scratch structures for zero-GC bisection
const scratchBisectRay: Ray2D = { origin: { x: 0, y: 0 }, dir: { x: 0, y: 0 } };
const scratchBisectHandOff: BoundaryRayHandOff = {
  hasIntersection: false,
  entryPoint: { x: 0, y: 0 },
  exitPoint: { x: 0, y: 0 },
  tEntry: 0,
  tExit: 0
};

/**
 * Binary bisection to find the boundary parameter u in [0, 1]
 * where a grazing beam intersects the black hole influence boundary.
 * Strictly converges to the entering side of the boundary so that
 * intersectRayInfluenceBoundary is mathematically guaranteed to succeed.
 */
export function bisectBlackHoleSplit(
  leftRay: Ray2D,
  rightRay: Ray2D,
  blackHole: BlackHole,
  iterations = 10
): number {
  const leftEnters = intersectRayInfluenceBoundary(scratchBisectHandOff, leftRay, blackHole);
  let uEntering = leftEnters ? 0.0 : 1.0;
  let uMissing = leftEnters ? 1.0 : 0.0;

  for (let i = 0; i < iterations; i++) {
    const uMid = 0.5 * (uEntering + uMissing);
    scratchBisectRay.origin.x = (1.0 - uMid) * leftRay.origin.x + uMid * rightRay.origin.x;
    scratchBisectRay.origin.y = (1.0 - uMid) * leftRay.origin.y + uMid * rightRay.origin.y;
    const dx = (1.0 - uMid) * leftRay.dir.x + uMid * rightRay.dir.x;
    const dy = (1.0 - uMid) * leftRay.dir.y + uMid * rightRay.dir.y;
    const len = Math.hypot(dx, dy) || 1.0;
    scratchBisectRay.dir.x = dx / len;
    scratchBisectRay.dir.y = dy / len;

    const midEnters = intersectRayInfluenceBoundary(scratchBisectHandOff, scratchBisectRay, blackHole);
    if (midEnters) {
      uEntering = uMid;
    } else {
      uMissing = uMid;
    }
  }

  return uEntering;
}

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
  private readonly reusableHandOffSplit: BoundaryRayHandOff = {
    hasIntersection: false,
    entryPoint: { x: 0, y: 0 },
    exitPoint: { x: 0, y: 0 },
    tEntry: 0,
    tExit: 0
  };
  private readonly reusableSplitRay: Ray2D = {
    origin: { x: 0, y: 0 },
    dir: { x: 0, y: 0 }
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
   * Gets total capacity of the pool array.
   */
  getPoolSize(): number {
    return this.frustumPool.length;
  }

  /**
   * Allocates a pre-allocated frustum from the pool with amortized zero-GC.
   * Dynamically grows the pool if capacity is exceeded to prevent branch dropping,
   * up to MAX_DYNAMIC_POOL_CAPACITY to prevent unbounded heap growth.
   */
  allocateFrustum(): BeamFrustum {
    if (this.poolCount >= this.frustumPool.length) {
      if (this.frustumPool.length < MAX_DYNAMIC_POOL_CAPACITY) {
        this.frustumPool.push(createBeamFrustum());
      } else {
        return this.frustumPool[this.frustumPool.length - 1];
      }
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

      const distL = hasLeftHit ? this.leftHitResult.t : maxDistance;
      const distR = hasRightHit ? this.rightHitResult.t : maxDistance;

      // Check if frustum enters a black hole BEFORE reaching the obstacles
      let closestBH: BlackHole | null = null;
      let closestEntryDist = Infinity;
      let splitType: 'both' | 'left_only' | 'right_only' | 'none' = 'none';

      for (let b = 0; b < blackHoles.length; b++) {
        const bh = blackHoles[b];
        const hasLeftEntry = intersectRayInfluenceBoundary(this.reusableHandOffL, current.leftRay, bh);
        const hasRightEntry = intersectRayInfluenceBoundary(this.reusableHandOffR, current.rightRay, bh);

        if (hasLeftEntry && hasRightEntry) {
          const tL = this.reusableHandOffL.tEntry;
          const tR = this.reusableHandOffR.tEntry;
          if (tL < distL && tR < distR) {
            const minEntry = Math.min(tL, tR);
            if (minEntry < closestEntryDist) {
              closestBH = bh;
              closestEntryDist = minEntry;
              splitType = 'both';
            }
          }
        } else if (hasLeftEntry && !hasRightEntry) {
          const tL = this.reusableHandOffL.tEntry;
          if (tL < distL && tL < closestEntryDist) {
            closestBH = bh;
            closestEntryDist = tL;
            splitType = 'left_only';
          }
        } else if (!hasLeftEntry && hasRightEntry) {
          const tR = this.reusableHandOffR.tEntry;
          if (tR < distR && tR < closestEntryDist) {
            closestBH = bh;
            closestEntryDist = tR;
            splitType = 'right_only';
          }
        }
      }

      if (closestBH !== null) {
        // Case A: Partial beam grazing -> split into entering portion and unaffected sub-frustum
        if (
          (splitType === 'left_only' || splitType === 'right_only') &&
          current.depth < MAX_BOUNCE_DEPTH
        ) {
          const uSplit = bisectBlackHoleSplit(current.leftRay, current.rightRay, closestBH);
          if (uSplit > 0.02 && uSplit < 0.98) {
            const splitOriginX = (1.0 - uSplit) * current.leftRay.origin.x + uSplit * current.rightRay.origin.x;
            const splitOriginY = (1.0 - uSplit) * current.leftRay.origin.y + uSplit * current.rightRay.origin.y;
            const splitDirX = (1.0 - uSplit) * current.leftRay.dir.x + uSplit * current.rightRay.dir.x;
            const splitDirY = (1.0 - uSplit) * current.leftRay.dir.y + uSplit * current.rightRay.dir.y;
            const splitLen = Math.hypot(splitDirX, splitDirY) || 1.0;
            const normDirX = splitDirX / splitLen;
            const normDirY = splitDirY / splitLen;
            this.reusableSplitRay.origin.x = splitOriginX;
            this.reusableSplitRay.origin.y = splitOriginY;
            this.reusableSplitRay.dir.x = normDirX;
            this.reusableSplitRay.dir.y = normDirY;

            const splitHasEntry = intersectRayInfluenceBoundary(this.reusableHandOffSplit, this.reusableSplitRay, closestBH);
            if (!splitHasEntry) {
              continue;
            }

            const splitEntryX = this.reusableHandOffSplit.entryPoint.x;
            const splitEntryY = this.reusableHandOffSplit.entryPoint.y;

            if (splitType === 'left_only') {
              // 1. Unaffected Right Sub-Frustum [uSplit, 1] continues through Euclidean space
              const unaffectedChild = this.allocateFrustum();
              copyBeamFrustum(unaffectedChild, current);
              unaffectedChild.intensity = current.intensity * (1.0 - uSplit);
              unaffectedChild.leftRay.origin.x = splitOriginX;
              unaffectedChild.leftRay.origin.y = splitOriginY;
              unaffectedChild.leftRay.dir.x = normDirX;
              unaffectedChild.leftRay.dir.y = normDirY;
              queue.push(unaffectedChild);

              // 2. Entered Left Sub-Frustum [0, uSplit]
              current.intensity = current.intensity * uSplit;
              current.rightRay.origin.x = splitOriginX;
              current.rightRay.origin.y = splitOriginY;
              current.rightRay.dir.x = normDirX;
              current.rightRay.dir.y = normDirY;

              intersectRayInfluenceBoundary(this.reusableHandOffL, current.leftRay, closestBH);
              current.leftHit.x = this.reusableHandOffL.entryPoint.x;
              current.leftHit.y = this.reusableHandOffL.entryPoint.y;
              current.rightHit.x = splitEntryX;
              current.rightHit.y = splitEntryY;

              activeFrustums.push(current);

              // Geodesic integration directly from boundary entry points
              const resL = traceGeodesicWithTermination(
                this.reusableTrajL,
                { origin: current.leftHit, dir: current.leftRay.dir },
                closestBH
              );
              const resR = traceGeodesicWithTermination(
                this.reusableTrajR,
                { origin: current.rightHit, dir: current.rightRay.dir },
                closestBH
              );

              if (onRibbon && this.reusableTrajL.pointCount >= 2 && this.reusableTrajR.pointCount >= 2) {
                onRibbon(this.reusableTrajL, this.reusableTrajR, current, closestBH);
              }

              if (
                resL.reason === TerminationReason.Escaped &&
                resR.reason === TerminationReason.Escaped &&
                resL.exitRay &&
                resR.exitRay &&
                current.depth + 1 < MAX_BOUNCE_DEPTH
              ) {
                const escapedChild = this.allocateFrustum();
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

              continue;
            } else {
              // splitType === 'right_only'
              // 1. Unaffected Left Sub-Frustum [0, uSplit] continues through Euclidean space
              const unaffectedChild = this.allocateFrustum();
              copyBeamFrustum(unaffectedChild, current);
              unaffectedChild.intensity = current.intensity * uSplit;
              unaffectedChild.rightRay.origin.x = splitOriginX;
              unaffectedChild.rightRay.origin.y = splitOriginY;
              unaffectedChild.rightRay.dir.x = normDirX;
              unaffectedChild.rightRay.dir.y = normDirY;
              queue.push(unaffectedChild);

              // 2. Entered Right Sub-Frustum [uSplit, 1]
              current.intensity = current.intensity * (1.0 - uSplit);
              current.leftRay.origin.x = splitOriginX;
              current.leftRay.origin.y = splitOriginY;
              current.leftRay.dir.x = normDirX;
              current.leftRay.dir.y = normDirY;

              intersectRayInfluenceBoundary(this.reusableHandOffR, current.rightRay, closestBH);
              current.leftHit.x = splitEntryX;
              current.leftHit.y = splitEntryY;
              current.rightHit.x = this.reusableHandOffR.entryPoint.x;
              current.rightHit.y = this.reusableHandOffR.entryPoint.y;

              activeFrustums.push(current);

              // Geodesic integration directly from boundary entry points
              const resL = traceGeodesicWithTermination(
                this.reusableTrajL,
                { origin: current.leftHit, dir: current.leftRay.dir },
                closestBH
              );
              const resR = traceGeodesicWithTermination(
                this.reusableTrajR,
                { origin: current.rightHit, dir: current.rightRay.dir },
                closestBH
              );

              if (onRibbon && this.reusableTrajL.pointCount >= 2 && this.reusableTrajR.pointCount >= 2) {
                onRibbon(this.reusableTrajL, this.reusableTrajR, current, closestBH);
              }

              if (
                resL.reason === TerminationReason.Escaped &&
                resR.reason === TerminationReason.Escaped &&
                resL.exitRay &&
                resR.exitRay &&
                current.depth + 1 < MAX_BOUNCE_DEPTH
              ) {
                const escapedChild = this.allocateFrustum();
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

              continue;
            }
          }
        }

        // Case B: Both boundary rays enter the black hole
        intersectRayInfluenceBoundary(this.reusableHandOffL, current.leftRay, closestBH);
        intersectRayInfluenceBoundary(this.reusableHandOffR, current.rightRay, closestBH);

        current.leftHit.x = this.reusableHandOffL.entryPoint.x;
        current.leftHit.y = this.reusableHandOffL.entryPoint.y;
        current.rightHit.x = this.reusableHandOffR.entryPoint.x;
        current.rightHit.y = this.reusableHandOffR.entryPoint.y;

        activeFrustums.push(current);

        // Trace left and right geodesics using unified traceGeodesicWithTermination
        const resL = traceGeodesicWithTermination(
          this.reusableTrajL,
          { origin: current.leftHit, dir: current.leftRay.dir },
          closestBH
        );
        const resR = traceGeodesicWithTermination(
          this.reusableTrajR,
          { origin: current.rightHit, dir: current.rightRay.dir },
          closestBH
        );

        // Emit curved ribbon mesh
        if (onRibbon && this.reusableTrajL.pointCount >= 2 && this.reusableTrajR.pointCount >= 2) {
          onRibbon(this.reusableTrajL, this.reusableTrajR, current, closestBH);
        }

        // Ray continuation: if both rays escape the gravity well, spawn an escaped downstream frustum
        if (
          resL.reason === TerminationReason.Escaped &&
          resR.reason === TerminationReason.Escaped &&
          resL.exitRay &&
          resR.exitRay &&
          current.depth + 1 < MAX_BOUNCE_DEPTH
        ) {
          const escapedChild = this.allocateFrustum();
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

        // Black hole absorbed/deflected the beam; do not continue straight into occluded obstacle
        continue;
      }

      // Check for geometric/corner discontinuity between boundary rays
      if (
        hasDiscontinuity(this.leftHitResult, this.rightHitResult) &&
        corners.length > 0 &&
        current.depth < MAX_BOUNCE_DEPTH
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

          // Spawn Left Sub-Frustum [leftRay -> splitRay]
          copyBeamFrustum(leftChild, current);
          leftChild.depth = current.depth + 1;
          leftChild.rightRay.origin.x = split.splitRay.origin.x;
          leftChild.rightRay.origin.y = split.splitRay.origin.y;
          leftChild.rightRay.dir.x = split.splitRay.dir.x;
          leftChild.rightRay.dir.y = split.splitRay.dir.y;
          queue.push(leftChild);

          // Spawn Right Sub-Frustum [splitRay -> rightRay]
          copyBeamFrustum(rightChild, current);
          rightChild.depth = current.depth + 1;
          rightChild.leftRay.origin.x = split.splitRay.origin.x;
          rightChild.leftRay.origin.y = split.splitRay.origin.y;
          rightChild.leftRay.dir.x = split.splitRay.dir.x;
          rightChild.leftRay.dir.y = split.splitRay.dir.y;
          queue.push(rightChild);

          continue;
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
        if (current.depth + 1 < MAX_BOUNCE_DEPTH) {
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
        continue;
      }

      // Dielectric interface: calculate Snell's refraction and Fresnel coefficients
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
      }

      // Handle partial boundary hit fallback (e.g. beam partially grazing boundary)
      if (hasLeftHit && !hasRightHit) {
        this.rightRefractionResult.reflectedDir.x = this.leftRefractionResult.reflectedDir.x;
        this.rightRefractionResult.reflectedDir.y = this.leftRefractionResult.reflectedDir.y;
        this.rightRefractionResult.refractedDir.x = this.leftRefractionResult.refractedDir.x;
        this.rightRefractionResult.refractedDir.y = this.leftRefractionResult.refractedDir.y;
        this.rightRefractionResult.R = this.leftRefractionResult.R;
        this.rightRefractionResult.T = this.leftRefractionResult.T;
        this.rightRefractionResult.isTIR = this.leftRefractionResult.isTIR;
      } else if (!hasLeftHit && hasRightHit) {
        this.leftRefractionResult.reflectedDir.x = this.rightRefractionResult.reflectedDir.x;
        this.leftRefractionResult.reflectedDir.y = this.rightRefractionResult.reflectedDir.y;
        this.leftRefractionResult.refractedDir.x = this.rightRefractionResult.refractedDir.x;
        this.leftRefractionResult.refractedDir.y = this.rightRefractionResult.refractedDir.y;
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
        current.depth + 1 < MAX_BOUNCE_DEPTH
      ) {
        const reflectedChild = this.allocateFrustum();
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

      // 2. Transmitted Child (Snell refraction, if not Total Internal Reflection)
      if (
        !isTIR &&
        avgT * current.intensity >= MIN_ENERGY_THRESHOLD &&
        current.depth + 1 < MAX_BOUNCE_DEPTH
      ) {
        const transmittedChild = this.allocateFrustum();
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

    return activeFrustums;
  }
}
