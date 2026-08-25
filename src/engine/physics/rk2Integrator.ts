/**
 * Distance-Mapped Adaptive RK2 Geodesic Integrator
 *
 * Implements second-order Runge-Kutta midpoint geodesic integration for photon trajectories
 * orbiting Schwarzschild black holes with distance-scaled adaptive step sizing and smoothstep
 * boundary acceleration fading over [10 rs, 12 rs].
 */

import { Vec2, type IVec2, clamp, smoothstep } from '../math/vec2';
import { type Ray2D } from '../geometry/intersections';

export const MAX_RK2_STEPS = 256;
export const DEFAULT_DT_MIN = 2.0;
export const DEFAULT_DT_MAX = 40.0;

export interface BlackHole {
  id: number;
  center: IVec2;
  rs: number; // Schwarzschild radius in px
  rInfluence: number; // Influence radius (12 * rs) in px
}

export interface GeodesicTrajectory {
  pointsX: Float32Array;
  pointsY: Float32Array;
  velocitiesX: Float32Array;
  velocitiesY: Float32Array;
  radii: Float32Array;
  angles: Float32Array;
  pointCount: number;
  capacity: number;
}

/**
 * Creates a pre-allocated GeodesicTrajectory container to prevent runtime GC.
 */
export function createGeodesicTrajectory(capacity = MAX_RK2_STEPS): GeodesicTrajectory {
  return {
    pointsX: new Float32Array(capacity),
    pointsY: new Float32Array(capacity),
    velocitiesX: new Float32Array(capacity),
    velocitiesY: new Float32Array(capacity),
    radii: new Float32Array(capacity),
    angles: new Float32Array(capacity),
    pointCount: 0,
    capacity
  };
}

/**
 * Computes distance-mapped adaptive time step size dt(r).
 * Micro-steps near the photon sphere (1.5 rs) / event horizon (rs) and larger leaps near outer boundary.
 */
export function calculateAdaptiveDt(
  r: number,
  rs: number,
  rInfluence: number,
  dtMin = DEFAULT_DT_MIN,
  dtMax = DEFAULT_DT_MAX
): number {
  const span = Math.max(1e-5, rInfluence - rs);
  const factor = clamp((r - rs) / span, 0.0, 1.0);
  return dtMin + (dtMax - dtMin) * factor;
}

/**
 * Evaluates the non-Euclidean gravitational acceleration vector on a photon:
 * a(r) = - (1.5 * rs / r^3) * r_vec * smoothstep(12 rs, 10 rs, r)
 */
export function calculateGravitationalAcceleration(
  outAcc: IVec2,
  pos: IVec2,
  blackHole: BlackHole
): void {
  const rx = pos.x - blackHole.center.x;
  const ry = pos.y - blackHole.center.y;
  const rSq = rx * rx + ry * ry;
  const r = Math.sqrt(rSq);

  const rs = blackHole.rs;
  const rInfluence = blackHole.rInfluence;
  const rFadeStart = 10.0 * rs;

  if (r >= rInfluence || r <= 1e-6) {
    outAcc.x = 0;
    outAcc.y = 0;
    return;
  }

  // Smoothstep acceleration fade over [10 rs, 12 rs]
  let fade = 1.0;
  if (r > rFadeStart) {
    fade = smoothstep(rInfluence, rFadeStart, r);
  }

  // Relativistic photon geodesic acceleration factor in 2D
  // Using k = 2.25 * rs gives the correct 2 * rs / b weak-field deflection
  // after accounting for the finite influence radius and smoothstep fade.
  const mag = -(2.25 * rs * fade) / (rSq * r);
  outAcc.x = rx * mag;
  outAcc.y = ry * mag;
}

const scratchAcc1: IVec2 = { x: 0, y: 0 };
const scratchMidPos: IVec2 = { x: 0, y: 0 };
const scratchAcc2: IVec2 = { x: 0, y: 0 };

/**
 * Advances photon state (position and velocity) by one adaptive RK2 midpoint step.
 */
export function stepRK2(
  outPos: IVec2,
  outVel: IVec2,
  currentPos: IVec2,
  currentVel: IVec2,
  blackHole: BlackHole,
  dt: number
): void {
  // k1 = a(r_n) * dt
  calculateGravitationalAcceleration(scratchAcc1, currentPos, blackHole);
  const k1x = scratchAcc1.x * dt;
  const k1y = scratchAcc1.y * dt;

  // Midpoint state: r_mid = r_n + v_n * (dt/2) + k1 * (dt/4)
  const halfDt = dt * 0.5;
  const qtrDt = dt * 0.25;
  scratchMidPos.x = currentPos.x + currentVel.x * halfDt + k1x * qtrDt;
  scratchMidPos.y = currentPos.y + currentVel.y * halfDt + k1y * qtrDt;

  // k2 = a(r_mid) * dt
  calculateGravitationalAcceleration(scratchAcc2, scratchMidPos, blackHole);
  const k2x = scratchAcc2.x * dt;
  const k2y = scratchAcc2.y * dt;

  // r_{n+1} = r_n + v_n * dt + k1 * (dt/2)
  outPos.x = currentPos.x + currentVel.x * dt + k1x * halfDt;
  outPos.y = currentPos.y + currentVel.y * dt + k1y * halfDt;

  // v_{n+1} = v_n + k2
  outVel.x = currentVel.x + k2x;
  outVel.y = currentVel.y + k2y;
  Vec2.normalize(outVel, outVel);
}

/**
 * Integrates an entire geodesic photon trajectory through a black hole's gravity well.
 */
export function integrateGeodesic(
  trajectory: GeodesicTrajectory,
  ray: Ray2D,
  blackHole: BlackHole,
  maxSteps = MAX_RK2_STEPS
): number {
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

  // Push initial knot
  const dx0 = curX - blackHole.center.x;
  const dy0 = curY - blackHole.center.y;
  const r0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);

  trajectory.pointsX[0] = curX;
  trajectory.pointsY[0] = curY;
  trajectory.velocitiesX[0] = velX;
  trajectory.velocitiesY[0] = velY;
  trajectory.radii[0] = r0;
  trajectory.angles[0] = Math.atan2(dy0, dx0);
  trajectory.pointCount = 1;

  for (let i = 1; i < steps; i++) {
    const rx = curX - blackHole.center.x;
    const ry = curY - blackHole.center.y;
    const r = Math.sqrt(rx * rx + ry * ry);

    // Event horizon capture check
    if (r <= blackHole.rs) {
      break;
    }

    // Boundary exit check (escaped gravity well moving outwards)
    if (i > 1 && r >= blackHole.rInfluence && rx * velX + ry * velY > 0) {
      break;
    }

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
    const nextR = Math.sqrt(nextRx * nextRx + nextRy * nextRy);

    trajectory.pointsX[i] = curX;
    trajectory.pointsY[i] = curY;
    trajectory.velocitiesX[i] = velX;
    trajectory.velocitiesY[i] = velY;
    trajectory.radii[i] = nextR;
    trajectory.angles[i] = Math.atan2(nextRy, nextRx);
    trajectory.pointCount++;
  }

  return trajectory.pointCount;
}
