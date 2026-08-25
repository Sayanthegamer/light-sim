/**
 * Zero-Allocation 2D Inlined Vector & Math Utilities
 * All operations mutate pre-allocated destination objects to avoid GC churn in 60 FPS render loops.
 */

export interface IVec2 {
  x: number;
  y: number;
}

export class Vec2 {
  /** Creates a new 2D vector object (only used for setup/allocation phases) */
  static create(x = 0, y = 0): IVec2 {
    return { x, y };
  }

  /** Sets coordinates of a vector */
  static set(out: IVec2, x: number, y: number): IVec2 {
    out.x = x;
    out.y = y;
    return out;
  }

  /** Copies vector `a` into `out` */
  static copy(out: IVec2, a: IVec2): IVec2 {
    out.x = a.x;
    out.y = a.y;
    return out;
  }

  /** Vector addition: out = a + b */
  static add(out: IVec2, a: IVec2, b: IVec2): IVec2 {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    return out;
  }

  /** Vector subtraction: out = a - b */
  static sub(out: IVec2, a: IVec2, b: IVec2): IVec2 {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    return out;
  }

  /** Vector scalar multiplication: out = a * s */
  static scale(out: IVec2, a: IVec2, s: number): IVec2 {
    out.x = a.x * s;
    out.y = a.y * s;
    return out;
  }

  /** Scale and add: out = a + b * s */
  static scaleAndAdd(out: IVec2, a: IVec2, b: IVec2, s: number): IVec2 {
    out.x = a.x + b.x * s;
    out.y = a.y + b.y * s;
    return out;
  }

  /** Dot product */
  static dot(a: IVec2, b: IVec2): number {
    return a.x * b.x + a.y * b.y;
  }

  /** 2D cross product / determinant (a.x * b.y - a.y * b.x) */
  static cross(a: IVec2, b: IVec2): number {
    return a.x * b.y - a.y * b.x;
  }

  /** Squared length of vector */
  static lenSq(a: IVec2): number {
    return a.x * a.x + a.y * a.y;
  }

  /** Euclidean length of vector */
  static len(a: IVec2): number {
    return Math.sqrt(a.x * a.x + a.y * a.y);
  }

  /** Distance between two points */
  static dist(a: IVec2, b: IVec2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Squared distance between two points */
  static distSq(a: IVec2, b: IVec2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  /** Normalizes vector to unit length */
  static normalize(out: IVec2, a: IVec2): IVec2 {
    const lenSq = a.x * a.x + a.y * a.y;
    if (lenSq > 1e-12) {
      const invLen = 1.0 / Math.sqrt(lenSq);
      out.x = a.x * invLen;
      out.y = a.y * invLen;
    } else {
      out.x = 0;
      out.y = 0;
    }
    return out;
  }

  /** Rotates vector `a` by `radians` */
  static rotate(out: IVec2, a: IVec2, radians: number): IVec2 {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = a.x;
    const y = a.y;
    out.x = x * cos - y * sin;
    out.y = x * sin + y * cos;
    return out;
  }

  /** Linear interpolation: out = a + (b - a) * t */
  static lerp(out: IVec2, a: IVec2, b: IVec2, t: number): IVec2 {
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    return out;
  }

  /** Computes the reflection vector: out = incident - 2.0 * dot(incident, normal) * normal */
  static reflect(out: IVec2, incident: IVec2, normal: IVec2): IVec2 {
    const d = 2.0 * (incident.x * normal.x + incident.y * normal.y);
    out.x = incident.x - d * normal.x;
    out.y = incident.y - d * normal.y;
    return out;
  }

  /**
   * Computes the Snell refraction vector.
   * @param out Destination vector
   * @param incident Unit incident vector
   * @param normal Unit surface normal
   * @param eta Ratio of refractive indices (n1 / n2)
   * @returns true if refraction occurs, false on Total Internal Reflection (TIR)
   */
  static refract(out: IVec2, incident: IVec2, normal: IVec2, eta: number): boolean {
    const cosI = -(incident.x * normal.x + incident.y * normal.y);
    const sinT2 = eta * eta * (1.0 - cosI * cosI);
    if (sinT2 > 1.0) {
      // Total Internal Reflection
      out.x = 0;
      out.y = 0;
      return false;
    }
    const cosT = Math.sqrt(1.0 - sinT2);
    const factor = eta * cosI - cosT;
    out.x = eta * incident.x + factor * normal.x;
    out.y = eta * incident.y + factor * normal.y;
    return true;
  }
}

/** Clamps value between min and max */
export function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

/** Linear interpolation between scalar a and b */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth cubic Hermite interpolation */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

/** Degrees to Radians */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180.0;
}

/** Radians to Degrees */
export function radToDeg(rad: number): number {
  return (rad * 180.0) / Math.PI;
}
