/**
 * Analytic 2D Ray-Segment & Ray-Arc Quadratic Intersection Solvers
 * Zero-allocation math routines for high-speed beam boundary collision detection.
 */

import { type IVec2 } from '../math/vec2';

const EPSILON = 1e-5;
const TWO_PI = 2.0 * Math.PI;

export interface Ray2D {
  origin: IVec2;
  dir: IVec2;
}

export interface Segment2D {
  id: number;
  p1: IVec2;
  p2: IVec2;
  n1: number; // Incident medium refractive index
  n2: number; // Transmitted medium refractive index
  cauchyA?: number;
  cauchyB?: number;
  isBarrier?: boolean;
  isMirror?: boolean;
}

export interface Arc2D {
  id: number;
  center: IVec2;
  radius: number;
  startAngle: number; // In radians [0, 2pi]
  endAngle: number;   // In radians [0, 2pi]
  nInside: number;    // Refractive index inside arc boundary
  nOutside: number;   // Refractive index outside arc boundary
  cauchyA?: number;
  cauchyB?: number;
  isBarrier?: boolean;
  isMirror?: boolean;
}

export interface HitResult {
  hit: boolean;
  t: number;
  point: IVec2;
  normal: IVec2;
  elementId: number;
  n1: number;
  n2: number;
  cauchyA: number;
  cauchyB: number;
  isBarrier: boolean;
  isMirror: boolean;
}

/** Allocates a reusable HitResult structure */
export function createHitResult(): HitResult {
  return {
    hit: false,
    t: Infinity,
    point: { x: 0, y: 0 },
    normal: { x: 0, y: 0 },
    elementId: -1,
    n1: 1.0,
    n2: 1.0,
    cauchyA: 1.0,
    cauchyB: 0.0,
    isBarrier: false,
    isMirror: false
  };
}

/**
 * Solves analytic 2D ray to line-segment intersection.
 * Mutates `out` result in place to prevent garbage collection.
 */
export function intersectRaySegment(
  out: HitResult,
  ray: Ray2D,
  segment: Segment2D
): boolean {
  const ox = ray.origin.x;
  const oy = ray.origin.y;
  const dx = ray.dir.x;
  const dy = ray.dir.y;

  const sx = segment.p2.x - segment.p1.x;
  const sy = segment.p2.y - segment.p1.y;

  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-10) {
    return false; // Ray is parallel to segment
  }

  const deltaX = segment.p1.x - ox;
  const deltaY = segment.p1.y - oy;

  const t = (deltaX * sy - deltaY * sx) / denom;
  const u = (deltaX * dy - deltaY * dx) / denom;

  if (t > EPSILON && u >= 0.0 && u <= 1.0) {
    out.hit = true;
    out.t = t;
    out.point.x = ox + t * dx;
    out.point.y = oy + t * dy;
    out.elementId = segment.id;
    out.cauchyA = segment.cauchyA ?? segment.n2;
    out.cauchyB = segment.cauchyB ?? 0.0;
    out.isBarrier = segment.isBarrier ?? false;
    out.isMirror = segment.isMirror ?? false;

    // Normal orthogonal to segment
    const segLen = Math.sqrt(sx * sx + sy * sy);
    let nx = -sy / segLen;
    let ny = sx / segLen;

    const dotRayNorm = dx * nx + dy * ny;
    if (dotRayNorm > 0) {
      // Ray is striking from the back-face (medium n2 to n1)
      nx = -nx;
      ny = -ny;
      out.n1 = segment.n2;
      out.n2 = segment.n1;
    } else {
      // Ray is striking front-face (medium n1 to n2)
      out.n1 = segment.n1;
      out.n2 = segment.n2;
    }

    out.normal.x = nx;
    out.normal.y = ny;
    return true;
  }

  return false;
}

/**
 * Checks if an angle in radians lies within an angular arc sector [startAngle, endAngle].
 */
function isAngleInArc(angle: number, startAngle: number, endAngle: number): boolean {
  // Normalize angle to [0, 2pi)
  let a = angle % TWO_PI;
  if (a < 0) {
    a += TWO_PI;
  }

  let s = startAngle % TWO_PI;
  if (s < 0) {
    s += TWO_PI;
  }

  let e = endAngle % TWO_PI;
  if (e < 0) {
    e += TWO_PI;
  }

  // Full circle check
  if (Math.abs(endAngle - startAngle) >= TWO_PI - 1e-6) {
    return true;
  }

  if (s <= e) {
    return a >= s - 1e-6 && a <= e + 1e-6;
  } else {
    // Arc crosses 0 boundary
    return a >= s - 1e-6 || a <= e + 1e-6;
  }
}

/**
 * Solves analytic quadratic 2D ray to circular arc intersection.
 * Evaluates (P(t) - C)^2 = r^2
 */
export function intersectRayArc(
  out: HitResult,
  ray: Ray2D,
  arc: Arc2D
): boolean {
  const ox = ray.origin.x;
  const oy = ray.origin.y;
  const dx = ray.dir.x;
  const dy = ray.dir.y;

  const cx = arc.center.x;
  const cy = arc.center.y;
  const r = arc.radius;

  const deltaX = ox - cx;
  const deltaY = oy - cy;

  // Since direction is normalized, a = 1
  const b = 2.0 * (dx * deltaX + dy * deltaY);
  const c = deltaX * deltaX + deltaY * deltaY - r * r;

  const discriminant = b * b - 4.0 * c;
  if (discriminant < 0) {
    return false; // No geometric intersection
  }

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDisc) * 0.5;
  const t2 = (-b + sqrtDisc) * 0.5;

  let chosenT = -1;

  // Check closest positive root
  if (t1 > EPSILON) {
    const px = ox + t1 * dx;
    const py = oy + t1 * dy;
    const angle = Math.atan2(py - cy, px - cx);
    if (isAngleInArc(angle, arc.startAngle, arc.endAngle)) {
      chosenT = t1;
    }
  }

  // If t1 did not hit or was behind ray, test t2
  if (chosenT < 0 && t2 > EPSILON) {
    const px = ox + t2 * dx;
    const py = oy + t2 * dy;
    const angle = Math.atan2(py - cy, px - cx);
    if (isAngleInArc(angle, arc.startAngle, arc.endAngle)) {
      chosenT = t2;
    }
  }

  if (chosenT > EPSILON) {
    out.hit = true;
    out.t = chosenT;
    const px = ox + chosenT * dx;
    const py = oy + chosenT * dy;
    out.point.x = px;
    out.point.y = py;
    out.elementId = arc.id;
    out.cauchyA = arc.cauchyA ?? arc.nInside;
    out.cauchyB = arc.cauchyB ?? 0.0;
    out.isBarrier = arc.isBarrier ?? false;
    out.isMirror = arc.isMirror ?? false;

    // Outward radial normal
    const invR = 1.0 / r;
    let nx = (px - cx) * invR;
    let ny = (py - cy) * invR;

    const dotRayNorm = dx * nx + dy * ny;
    if (dotRayNorm > 0) {
      // Ray is traveling from inside the circle to the outside
      nx = -nx;
      ny = -ny;
      out.n1 = arc.nInside;
      out.n2 = arc.nOutside;
    } else {
      // Ray is entering circle from outside
      out.n1 = arc.nOutside;
      out.n2 = arc.nInside;
    }

    out.normal.x = nx;
    out.normal.y = ny;
    return true;
  }

  return false;
}

/**
 * Finds the closest intersection for a ray across an array of flat segments and circular arcs.
 */
export function findClosestIntersection(
  out: HitResult,
  ray: Ray2D,
  segments: readonly Segment2D[],
  arcs: readonly Arc2D[]
): boolean {
  out.hit = false;
  out.t = Infinity;

  const tempHit = createHitResult();

  for (let i = 0; i < segments.length; i++) {
    if (intersectRaySegment(tempHit, ray, segments[i])) {
      if (tempHit.t < out.t) {
        copyHitResult(out, tempHit);
      }
    }
  }

  for (let j = 0; j < arcs.length; j++) {
    if (intersectRayArc(tempHit, ray, arcs[j])) {
      if (tempHit.t < out.t) {
        copyHitResult(out, tempHit);
      }
    }
  }

  return out.hit;
}

/** Inlined copy for HitResult */
export function copyHitResult(dest: HitResult, src: HitResult): void {
  dest.hit = src.hit;
  dest.t = src.t;
  dest.point.x = src.point.x;
  dest.point.y = src.point.y;
  dest.normal.x = src.normal.x;
  dest.normal.y = src.normal.y;
  dest.elementId = src.elementId;
  dest.n1 = src.n1;
  dest.n2 = src.n2;
  dest.cauchyA = src.cauchyA;
  dest.cauchyB = src.cauchyB;
  dest.isBarrier = src.isBarrier;
  dest.isMirror = src.isMirror;
}
