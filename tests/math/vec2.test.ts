import { describe, it, expect } from 'vitest';
import {
  Vec2,
  clamp,
  smoothstep,
  lerp,
  degToRad,
  radToDeg,
  type IVec2
} from '../../src/engine/math/vec2';

describe('Zero-Allocation Vec2 Math Module', () => {
  it('creates and sets vector coordinates', () => {
    const v: IVec2 = { x: 0, y: 0 };
    Vec2.set(v, 3, 4);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);

    const v2 = Vec2.create(5, 6);
    expect(v2.x).toBe(5);
    expect(v2.y).toBe(6);

    Vec2.copy(v, v2);
    expect(v.x).toBe(5);
    expect(v.y).toBe(6);
  });

  it('performs vector addition, subtraction and scaling', () => {
    const a: IVec2 = { x: 1, y: 2 };
    const b: IVec2 = { x: 3, y: 4 };
    const out: IVec2 = { x: 0, y: 0 };

    Vec2.add(out, a, b);
    expect(out.x).toBe(4);
    expect(out.y).toBe(6);

    Vec2.sub(out, a, b);
    expect(out.x).toBe(-2);
    expect(out.y).toBe(-2);

    Vec2.scale(out, a, 3);
    expect(out.x).toBe(3);
    expect(out.y).toBe(6);

    Vec2.scaleAndAdd(out, a, b, 2);
    expect(out.x).toBe(7); // 1 + 3*2
    expect(out.y).toBe(10); // 2 + 4*2
  });

  it('computes dot product, cross product, lengths, distances, and normalization', () => {
    const a: IVec2 = { x: 3, y: 4 };
    const b: IVec2 = { x: 0, y: 1 };
    const out: IVec2 = { x: 0, y: 0 };

    expect(Vec2.dot(a, b)).toBe(4);
    expect(Vec2.cross(a, b)).toBe(3); // 3*1 - 4*0 = 3
    expect(Vec2.lenSq(a)).toBe(25);
    expect(Vec2.len(a)).toBe(5);
    expect(Vec2.dist(a, { x: 0, y: 0 })).toBe(5);
    expect(Vec2.distSq(a, { x: 0, y: 0 })).toBe(25);

    Vec2.normalize(out, a);
    expect(out.x).toBeCloseTo(0.6, 5);
    expect(out.y).toBeCloseTo(0.8, 5);
    expect(Vec2.len(out)).toBeCloseTo(1.0, 5);

    // zero vector normalization check
    Vec2.normalize(out, { x: 0, y: 0 });
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('rotates and linear interpolates vectors', () => {
    const a: IVec2 = { x: 1, y: 0 };
    const out: IVec2 = { x: 0, y: 0 };

    Vec2.rotate(out, a, Math.PI / 2);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(1, 5);

    const b: IVec2 = { x: 3, y: 10 };
    Vec2.lerp(out, a, b, 0.5);
    expect(out.x).toBe(2);
    expect(out.y).toBe(5);
  });

  it('computes vector reflections and refractions accurately', () => {
    // Reflection
    const incident: IVec2 = { x: 1, y: -1 };
    Vec2.normalize(incident, incident); // 45 degrees downward
    const normal: IVec2 = { x: 0, y: 1 }; // upward normal
    const out: IVec2 = { x: 0, y: 0 };

    Vec2.reflect(out, incident, normal);
    expect(out.x).toBeCloseTo(incident.x, 5);
    expect(out.y).toBeCloseTo(-incident.y, 5); // reflected upward

    // Refraction (Air n1=1 to Glass n2=1.5, eta = 1/1.5 = 2/3)
    const refracted = Vec2.refract(out, incident, normal, 1.0 / 1.5);
    expect(refracted).toBe(true);
    expect(out.y).toBeLessThan(0); // continues downwards, bent towards normal
    expect(Vec2.len(out)).toBeCloseTo(1.0, 5);

    // Total Internal Reflection (Glass to Air, eta = 1.5/1.0 = 1.5 at steep grazing angle > critical angle ~41.8 deg)
    const steepIncident: IVec2 = { x: 0.3, y: 0.954 };
    Vec2.normalize(steepIncident, steepIncident);
    const tirNormal: IVec2 = { x: -1, y: 0 };
    const canRefract = Vec2.refract(out, steepIncident, tirNormal, 1.5);
    expect(canRefract).toBe(false);
  });

  it('provides reliable scalar utility helpers', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);

    expect(lerp(0, 100, 0.25)).toBe(25);

    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);

    expect(degToRad(180)).toBeCloseTo(Math.PI, 5);
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 5);
  });
});
