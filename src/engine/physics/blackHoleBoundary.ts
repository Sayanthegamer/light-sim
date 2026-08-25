/**
 * 4-Condition Priority Termination & Boundary Splicing Engine
 *
 * Manages localized field boundaries (R_influence = 12 rs), analytic circular hand-off,
 * C1 velocity splicing, and the 4-condition priority termination loop:
 * 1. Event horizon capture (r <= rs) -> clamp to horizon, zero intensity
 * 2. Boundary escape (r >= 12 rs, v . r > 0) -> C1 handoff to straight-line solver
 * 3. Cumulative polar winding cap (sum |dTheta| >= 2*PI) -> smooth alpha fade
 * 4. Failsafe step budget cap (N = 64)
 */

import { type IVec2 } from '../math/vec2';
import { type Ray2D } from '../geometry/intersections';
import {
  type BlackHole,
  type GeodesicTrajectory,
  calculateAdaptiveDt,
  stepRK2,
  MAX_RK2_STEPS
} from './rk2Integrator';

const EPSILON = 1e-5;

export enum TerminationReason {
  Captured = 'captured',
  Escaped = 'escaped',
  WindingCap = 'winding_cap',
  MaxSteps = 'max_steps'
}

export interface BoundaryRayHandOff {
  hasIntersection: boolean;
  entryPoint: IVec2;
  exitPoint: IVec2;
  tEntry: number;
  tExit: number;
}

export interface GeodesicResult {
  reason: TerminationReason;
  exitRay: Ray2D | null;
  cumulativeWinding: number;
}

/**
 * Solves analytic ray-circle intersection against black hole influence perimeter (R_influence = 12 rs).
 * Mutates `out` result in place to prevent runtime garbage collection.
 */
export function intersectRayInfluenceBoundary(
  out: BoundaryRayHandOff,
  ray: Ray2D,
  blackHole: BlackHole
): boolean {
  const ox = ray.origin.x - blackHole.center.x;
  const oy = ray.origin.y - blackHole.center.y;
  const dx = ray.dir.x;
  const dy = ray.dir.y;
  const r = blackHole.rInfluence;

  // a = dx*dx + dy*dy = 1 (direction is normalized)
  const b = 2.0 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - r * r;

  const discriminant = b * b - 4.0 * c;
  if (discriminant < 0) {
    out.hasIntersection = false;
    return false;
  }

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDisc) * 0.5;
  const t2 = (-b + sqrtDisc) * 0.5;

  // Forward entry from outside the influence sphere
  if (t1 > EPSILON) {
    out.hasIntersection = true;
    out.tEntry = t1;
    out.tExit = t2;
    out.entryPoint.x = ray.origin.x + t1 * dx;
    out.entryPoint.y = ray.origin.y + t1 * dy;
    out.exitPoint.x = ray.origin.x + t2 * dx;
    out.exitPoint.y = ray.origin.y + t2 * dy;
    return true;
  }

  // Ray starts strictly inside influence sphere and moves inward
  if (c < -EPSILON && b < 0 && t2 > EPSILON) {
    out.hasIntersection = true;
    out.tEntry = 0.0;
    out.tExit = t2;
    out.entryPoint.x = ray.origin.x;
    out.entryPoint.y = ray.origin.y;
    out.exitPoint.x = ray.origin.x + t2 * dx;
    out.exitPoint.y = ray.origin.y + t2 * dy;
    return true;
  }

  out.hasIntersection = false;
  return false;
}

/**
 * Traces a geodesic photon trajectory with 4-condition priority termination and cumulative polar winding tracking.
 */
export function traceGeodesicWithTermination(
  trajectory: GeodesicTrajectory,
  ray: Ray2D,
  blackHole: BlackHole,
  maxWinding = 2.0 * Math.PI,
  maxSteps = MAX_RK2_STEPS
): GeodesicResult {
  const steps = Math.min(maxSteps, trajectory.capacity);
  trajectory.pointCount = 0;

  let curX = ray.origin.x;
  let curY = ray.origin.y;
  let velX = ray.dir.x;
  let velY = ray.dir.y;

  const nextPos: IVec2 = { x: 0, y: 0 };
  const nextVel: IVec2 = { x: 0, y: 0 };
  const curPos: IVec2 = { x: curX, y: curY };
  const curVel: IVec2 = { x: velX, y: velY };

  // Initial knot
  const dx0 = curX - blackHole.center.x;
  const dy0 = curY - blackHole.center.y;
  const r0 = Math.hypot(dx0, dy0);
  let prevAngle = Math.atan2(dy0, dx0);
  let cumulativeWinding = 0.0;

  trajectory.pointsX[0] = curX;
  trajectory.pointsY[0] = curY;
  trajectory.velocitiesX[0] = velX;
  trajectory.velocitiesY[0] = velY;
  trajectory.radii[0] = r0;
  trajectory.angles[0] = prevAngle;
  trajectory.pointCount = 1;

  let terminationReason = TerminationReason.MaxSteps;
  let exitRay: Ray2D | null = null;

  for (let i = 1; i < steps; i++) {
    const rx = curX - blackHole.center.x;
    const ry = curY - blackHole.center.y;
    const r = Math.hypot(rx, ry);

    // Condition 1: Horizon capture (r <= rs)
    if (r <= blackHole.rs) {
      // Clamp final vertex to horizon circle surface
      const invR = blackHole.rs / Math.max(1e-5, r);
      trajectory.pointsX[i - 1] = blackHole.center.x + rx * invR;
      trajectory.pointsY[i - 1] = blackHole.center.y + ry * invR;
      trajectory.radii[i - 1] = blackHole.rs;

      terminationReason = TerminationReason.Captured;
      exitRay = null;
      break;
    }

    // Condition 2: Boundary escape (r >= 12 rs, moving outward)
    if (i > 1 && r >= blackHole.rInfluence && rx * velX + ry * velY > 0) {
      terminationReason = TerminationReason.Escaped;
      exitRay = {
        origin: { x: curX, y: curY },
        dir: { x: velX, y: velY }
      };
      break;
    }

    // Condition 3: Winding limit (|cumTheta| >= 2*PI)
    if (cumulativeWinding >= maxWinding) {
      terminationReason = TerminationReason.WindingCap;
      exitRay = null;
      break;
    }

    // Advance state via adaptive RK2
    const dt = calculateAdaptiveDt(r, blackHole.rs, blackHole.rInfluence);
    curPos.x = curX;
    curPos.y = curY;
    curVel.x = velX;
    curVel.y = velY;

    stepRK2(nextPos, nextVel, curPos, curVel, blackHole, dt);

    curX = nextPos.x;
    curY = nextPos.y;
    velX = nextVel.x;
    velY = nextVel.y;

    const nextRx = curX - blackHole.center.x;
    const nextRy = curY - blackHole.center.y;
    const nextR = Math.hypot(nextRx, nextRy);
    const nextAngle = Math.atan2(nextRy, nextRx);

    // Calculate angular deflection delta
    let deltaAngle = nextAngle - prevAngle;
    while (deltaAngle > Math.PI) {
      deltaAngle -= 2.0 * Math.PI;
    }
    while (deltaAngle < -Math.PI) {
      deltaAngle += 2.0 * Math.PI;
    }
    cumulativeWinding += Math.abs(deltaAngle);
    prevAngle = nextAngle;

    trajectory.pointsX[i] = curX;
    trajectory.pointsY[i] = curY;
    trajectory.velocitiesX[i] = velX;
    trajectory.velocitiesY[i] = velY;
    trajectory.radii[i] = nextR;
    trajectory.angles[i] = nextAngle;
    trajectory.pointCount++;

    // Check capture on stepped position
    if (nextR <= blackHole.rs) {
      const invNextR = blackHole.rs / Math.max(1e-5, nextR);
      trajectory.pointsX[i] = blackHole.center.x + nextRx * invNextR;
      trajectory.pointsY[i] = blackHole.center.y + nextRy * invNextR;
      trajectory.radii[i] = blackHole.rs;

      terminationReason = TerminationReason.Captured;
      exitRay = null;
      break;
    }

    // Check escape on stepped position
    if (i > 1 && nextR >= blackHole.rInfluence && nextRx * velX + nextRy * velY > 0) {
      terminationReason = TerminationReason.Escaped;
      exitRay = {
        origin: { x: curX, y: curY },
        dir: { x: velX, y: velY }
      };
      break;
    }
  }

  return {
    reason: terminationReason,
    exitRay,
    cumulativeWinding
  };
}
