/**
 * 5-Step Adaptive Bisection Corner Snapping Engine
 * Subdivides wavefront discontinuities across object corners with sub-pixel vertex snapping (<0.5 px)
 * to prevent light-leak gaps and precision tearing.
 */

import { Vec2, type IVec2 } from '../math/vec2';
import {
  type Ray2D,
  type Segment2D,
  type Arc2D,
  type HitResult,
  createHitResult,
  findClosestIntersection,
  copyHitResult
} from './intersections';

export interface WavefrontAnchor {
  u: number;
  ray: Ray2D;
}

export interface CornerVertex {
  x: number;
  y: number;
  elementId: number;
}

export interface SplitResult {
  uSplit: number;
  splitRay: Ray2D;
  splitHit: HitResult;
  snappedToCorner: boolean;
}

/**
 * Evaluates whether two adjacent wavefront ray hit results have a geometric or surface discontinuity.
 */
export function hasDiscontinuity(
  hitA: HitResult,
  hitB: HitResult,
  maxDistanceDelta = 50.0
): boolean {
  // Hit status mismatch (one hits geometry, one misses into void)
  if (hitA.hit !== hitB.hit) {
    return true;
  }

  // If both missed, there is no discontinuity
  if (!hitA.hit && !hitB.hit) {
    return false;
  }

  // Hit different obstacle elements
  if (hitA.elementId !== hitB.elementId) {
    return true;
  }

  // Normal deviation check: Dot product < 0.999 indicates a sharp corner on curved or faceted boundary
  const dotNorm = hitA.normal.x * hitB.normal.x + hitA.normal.y * hitB.normal.y;
  if (dotNorm < 0.999) {
    return true;
  }

  // Sudden depth discontinuity on the same element
  if (Math.abs(hitA.t - hitB.t) > maxDistanceDelta) {
    return true;
  }

  return false;
}

/**
 * Snaps a 2D hit coordinate to the nearest obstacle corner vertex if within epsilon distance (e.g. 0.5 px).
 */
export function snapToNearestCornerVertex(
  point: IVec2,
  corners: readonly CornerVertex[],
  epsilon = 0.5
): boolean {
  const epsSq = epsilon * epsilon;
  let minDistSq = Infinity;
  let nearestIdx = -1;

  for (let i = 0; i < corners.length; i++) {
    const dx = point.x - corners[i].x;
    const dy = point.y - corners[i].y;
    const distSq = dx * dx + dy * dy;
    if (distSq < epsSq && distSq < minDistSq) {
      minDistSq = distSq;
      nearestIdx = i;
    }
  }

  if (nearestIdx >= 0) {
    point.x = corners[nearestIdx].x;
    point.y = corners[nearestIdx].y;
    return true;
  }

  return false;
}

/**
 * Interpolates ray origin and direction between two anchor points along the wavefront aperture.
 */
export function interpolateRay(
  out: Ray2D,
  left: WavefrontAnchor,
  right: WavefrontAnchor,
  targetU: number
): void {
  const span = right.u - left.u;
  const factor = Math.abs(span) < 1e-10 ? 0.0 : (targetU - left.u) / span;

  Vec2.lerp(out.origin, left.ray.origin, right.ray.origin, factor);
  Vec2.lerp(out.dir, left.ray.dir, right.ray.dir, factor);
  Vec2.normalize(out.dir, out.dir);
}

/**
 * Performs fixed 5-step bisection along the wavefront interval [left.u, right.u]
 * to locate the exact splitting boundary on an obstacle corner.
 */
export function bisectBoundaryDiscontinuity(
  left: WavefrontAnchor,
  right: WavefrontAnchor,
  segments: readonly Segment2D[],
  arcs: readonly Arc2D[],
  corners: readonly CornerVertex[],
  maxSteps = 5,
  snapEpsilon = 0.5
): SplitResult {
  let uL = left.u;
  let uR = right.u;

  const hitL = createHitResult();
  const hitR = createHitResult();
  const midRay: Ray2D = { origin: { x: 0, y: 0 }, dir: { x: 0, y: 0 } };
  const midHit = createHitResult();

  findClosestIntersection(hitL, left.ray, segments, arcs);
  findClosestIntersection(hitR, right.ray, segments, arcs);

  for (let step = 0; step < maxSteps; step++) {
    const uMid = 0.5 * (uL + uR);
    interpolateRay(midRay, left, right, uMid);
    findClosestIntersection(midHit, midRay, segments, arcs);

    // If midHit matches left side's topology, move left bound forward
    if (!hasDiscontinuity(hitL, midHit)) {
      uL = uMid;
      copyHitResult(hitL, midHit);
    } else {
      uR = uMid;
      copyHitResult(hitR, midHit);
    }
  }

  const finalU = 0.5 * (uL + uR);
  interpolateRay(midRay, left, right, finalU);
  findClosestIntersection(midHit, midRay, segments, arcs);

  // If ray did not hit directly or hit near corner, attempt corner vertex snapping
  let snapped = false;
  if (midHit.hit) {
    snapped = snapToNearestCornerVertex(midHit.point, corners, snapEpsilon);
  } else if (hitL.hit) {
    // If the mid ray slightly missed over the corner edge, snap the hit point from hitL
    midHit.point.x = hitL.point.x;
    midHit.point.y = hitL.point.y;
    snapped = snapToNearestCornerVertex(midHit.point, corners, snapEpsilon);
    if (snapped) {
      midHit.hit = true;
      copyHitResult(midHit, hitL);
    }
  }

  return {
    uSplit: finalU,
    splitRay: {
      origin: { ...midRay.origin },
      dir: { ...midRay.dir }
    },
    splitHit: midHit,
    snappedToCorner: snapped
  };
}
