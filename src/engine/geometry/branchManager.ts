/**
 * Branch Management & Fresnel Energy Culling Engine
 * Manages parent-child beam frustum trees, recursive dielectric splits,
 * TIR bounds, and sub-threshold energy pruning (I < 0.005, depth <= 8, pool <= 32).
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

export const MAX_BOUNCE_DEPTH = 8;
export const MIN_ENERGY_THRESHOLD = 0.005;
export const MAX_FRUSTUM_POOL = 32;

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

export class BranchManager {
  private readonly frustumPool: BeamFrustum[];
  private poolCount = 0;
  private readonly leftHitResult: HitResult;
  private readonly rightHitResult: HitResult;
  private readonly leftRefractionResult: RefractionResult;
  private readonly rightRefractionResult: RefractionResult;

  constructor() {
    this.frustumPool = [];
    for (let i = 0; i < MAX_FRUSTUM_POOL; i++) {
      this.frustumPool.push({
        id: i,
        depth: 0,
        leftRay: { origin: { x: 0, y: 0 }, dir: { x: 0, y: 0 } },
        rightRay: { origin: { x: 0, y: 0 }, dir: { x: 0, y: 0 } },
        leftHit: { x: 0, y: 0 },
        rightHit: { x: 0, y: 0 },
        intensity: 1.0,
        dispersionU: -1.0,
        tintRGB: [255, 255, 255],
        isDispersed: false
      });
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
   * Traces an entire light tree starting from an initial beam frustum across scene obstacles.
   * Mutates pre-allocated pool items and returns active frustums array.
   */
  traceLightTree(
    initial: BeamFrustum,
    segments: readonly Segment2D[],
    arcs: readonly Arc2D[],
    corners: readonly CornerVertex[] = [],
    maxDistance = 2000
  ): BeamFrustum[] {
    this.poolCount = 0;
    const activeFrustums: BeamFrustum[] = [];

    // Queue of frustums to process
    const queue: BeamFrustum[] = [];

    // Allocate root from pool
    const root = this.allocateFrustum();
    this.copyFrustum(root, initial);
    root.id = 0;
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

      // Check for geometric/corner discontinuity between boundary rays
      if (
        hasDiscontinuity(this.leftHitResult, this.rightHitResult) &&
        corners.length > 0 &&
        current.depth < MAX_BOUNCE_DEPTH &&
        this.poolCount + 1 < MAX_FRUSTUM_POOL
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
          // Spawn Left Sub-Frustum [leftRay -> splitRay]
          const leftChild = this.allocateFrustum();
          this.copyFrustum(leftChild, current);
          leftChild.rightRay.origin.x = split.splitRay.origin.x;
          leftChild.rightRay.origin.y = split.splitRay.origin.y;
          leftChild.rightRay.dir.x = split.splitRay.dir.x;
          leftChild.rightRay.dir.y = split.splitRay.dir.y;
          queue.push(leftChild);

          // Spawn Right Sub-Frustum [splitRay -> rightRay]
          const rightChild = this.allocateFrustum();
          this.copyFrustum(rightChild, current);
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
        if (current.depth + 1 < MAX_BOUNCE_DEPTH && this.poolCount < MAX_FRUSTUM_POOL) {
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
          mirrorChild.tintRGB = [...current.tintRGB];
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
        this.poolCount < MAX_FRUSTUM_POOL
      ) {
        const reflectedChild = this.allocateFrustum();
        reflectedChild.depth = current.depth + 1;
        reflectedChild.intensity = current.intensity * avgR;
        reflectedChild.dispersionU = current.dispersionU;
        reflectedChild.tintRGB = [...current.tintRGB];
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
        current.depth + 1 < MAX_BOUNCE_DEPTH &&
        this.poolCount < MAX_FRUSTUM_POOL
      ) {
        const transmittedChild = this.allocateFrustum();
        transmittedChild.depth = current.depth + 1;
        transmittedChild.intensity = current.intensity * avgT;
        transmittedChild.dispersionU = current.dispersionU;
        transmittedChild.tintRGB = [...current.tintRGB];
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

  private allocateFrustum(): BeamFrustum {
    if (this.poolCount >= MAX_FRUSTUM_POOL) {
      return this.frustumPool[MAX_FRUSTUM_POOL - 1];
    }
    const frustum = this.frustumPool[this.poolCount];
    frustum.id = this.poolCount;
    this.poolCount++;
    return frustum;
  }

  private copyFrustum(dest: BeamFrustum, src: BeamFrustum): void {
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
}
