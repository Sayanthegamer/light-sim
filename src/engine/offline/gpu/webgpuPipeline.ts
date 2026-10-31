/**
 * WebGPU Pipeline, Shader Modules & Buffer Dispatch Manager
 *
 * Implements the WebGPU Compute-to-Raster hybrid pipeline, shader storage buffer
 * bindings, hardware clip-culling rasterization, and adaptive micro-batch pacing.
 */

import { type IOfflineSceneGeometry } from '../mcPhotonTracer';
import {
  packSceneBuffers,
  PHOTON_VERTEX_STRIDE_BYTES
} from './gpuPrimitiveLayout';
import { buildGpuBVH } from './gpuBvhBuilder';

export const BufferUsage = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200
};

// Pre-scale factor applied to fragment output in rgba16float to prevent half-float mantissa underflow,
// and inverted during CPU Float32/Float64 readback in GpuAccumulator.
export const GPU_HALF_FLOAT_PRESCALE = 16.0;

export const PHOTON_TRANSPORT_WGSL = /* wgsl */ `
struct BVHNode {
  aabbMin: vec2<f32>,
  aabbMax: vec2<f32>,
  leftChild: u32,
  rightChildOrCount: u32,
  primType: u32,
  primIndex: u32,
};

struct SegmentPrimitive {
  p1: vec2<f32>,
  p2: vec2<f32>,
  optics: vec4<f32>, // n1 (<= -0.5 mirror, == 0 barrier, > 0 dielectric), n2, cauchyA, cauchyB
};

struct ArcPrimitive {
  center: vec2<f32>,
  radius: f32,
  nGlass: f32,       // > 0 convex (glass inside), < 0 concave (glass outside)
  angles: vec2<f32>, // startAngle, endAngle
  cauchy: vec2<f32>, // cauchyA, cauchyB
};

struct BlackHolePrimitive {
  center: vec2<f32>,
  radii: vec2<f32>,  // rs, rInfluence
};

struct EmitterPrimitive {
  pos: vec2<f32>,
  dir: vec2<f32>,
  params: vec4<f32>, // width, spectrumType, spectrumParam, power
};

struct UniformSceneConfig {
  bounds: vec4<f32>,     // minX, minY, maxX, maxY
  counts: vec4<u32>,     // numBVH, numSegments, numArcs, numBlackHoles
  params: vec4<f32>,     // seed, maxBounces, russianRouletteThreshold, passSeed
  renderDim: vec2<f32>,  // width, height
  batchPhotons: u32,
  emitterCount: u32,
};

struct PhotonVertex {
  pos: vec2<f32>,
  wavelength: f32,
  flags: u32,            // 0 = active, 1 = dead/culled
  color: vec3<f32>,
  energy: f32,
};

@group(0) @binding(0) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(1) var<storage, read> segments: array<SegmentPrimitive>;
@group(0) @binding(2) var<storage, read> arcs: array<ArcPrimitive>;
@group(0) @binding(3) var<storage, read> blackHoles: array<BlackHolePrimitive>;
@group(0) @binding(4) var<storage, read> emitters: array<EmitterPrimitive>;
@group(0) @binding(5) var<uniform> config: UniformSceneConfig;
@group(0) @binding(6) var<storage, read_write> photonVertices: array<PhotonVertex>;

// PCG32 Random Number Generator
struct RngState {
  state: u32,
  inc: u32,
};

fn pcg32_init(seed1: u32, seed2: u32) -> RngState {
  var rng: RngState;
  rng.state = 0u;
  rng.inc = (seed2 << 1u) | 1u;
  rng.state = rng.state * 747796405u + rng.inc;
  rng.state = rng.state + seed1;
  rng.state = rng.state * 747796405u + rng.inc;
  return rng;
}

fn pcg32_next(rng: ptr<function, RngState>) -> f32 {
  let oldstate = (*rng).state;
  (*rng).state = oldstate * 747796405u + (*rng).inc;
  let word = ((oldstate >> ((oldstate >> 28u) + 4u)) ^ oldstate) * 277803737u;
  let res = (word >> 22u) ^ word;
  return f32(res) * (1.0 / 4294967296.0);
}

// Analytic CIE 1931 XYZ Color Matching (Wyman, Sloan, Shirley 2013)
fn gaussian(x: f32, mu: f32, sigma1: f32, sigma2: f32) -> f32 {
  let sigma = select(sigma2, sigma1, x < mu);
  let t = (x - mu) / sigma;
  return exp(-0.5 * t * t);
}

fn wavelengthToXYZ(wl: f32) -> vec3<f32> {
  let x = 1.056 * gaussian(wl, 599.8, 37.9, 31.0)
        + 0.362 * gaussian(wl, 442.0, 16.0, 26.7)
        - 0.065 * gaussian(wl, 501.1, 20.4, 18.9);

  let y = 0.821 * gaussian(wl, 568.8, 46.9, 40.5)
        + 0.286 * gaussian(wl, 530.9, 16.3, 31.1);

  let z = 1.217 * gaussian(wl, 437.0, 11.8, 36.0)
        + 0.681 * gaussian(wl, 459.0, 26.0, 13.8);

  return vec3<f32>(max(0.0, x), max(0.0, y), max(0.0, z));
}

fn wavelengthToRGB(lambda: f32) -> vec3<f32> {
  let xyz = wavelengthToXYZ(lambda);
  let r = 3.2404542 * xyz.x - 1.5371385 * xyz.y - 0.4985314 * xyz.z;
  let g = -0.969266 * xyz.x + 1.8760108 * xyz.y + 0.041556 * xyz.z;
  let b = 0.0556434 * xyz.x - 0.2040259 * xyz.y + 1.0572252 * xyz.z;
  return vec3<f32>(max(0.0, r), max(0.0, g), max(0.0, b));
}

fn evaluateCauchy(lambdaNm: f32, a: f32, b: f32) -> f32 {
  let effB = select(b, b * 1000000.0, b > 0.0 && b < 1.0);
  let clampedWl = clamp(lambdaNm, 380.0, 780.0);
  return a + (effB / (clampedWl * clampedWl));
}

// D65 Daylight SPD importance sampling matching CPU sampleD65Wavelength
fn sampleD65WavelengthWgsl(rng: ptr<function, RngState>) -> f32 {
  for (var iter = 0u; iter < 4u; iter = iter + 1u) {
    let wl = 380.0 + pcg32_next(rng) * 400.0;
    let u = (wl - 560.0) / 100.0;
    let hump = (wl - 460.0) / 30.0;
    let pdf = clamp((1.0 - 0.15 * u + 0.1 * exp(-0.5 * hump * hump)) / 1.35, 0.05, 1.0);
    if (pcg32_next(rng) <= pdf) {
      return wl;
    }
  }
  return 380.0 + pcg32_next(rng) * 400.0;
}

// Ray-Segment Intersection
struct HitInfo {
  hit: bool,
  t: f32,
  normal: vec2<f32>,
  n1: f32,
  n2: f32,
  cauchyA: f32,
  cauchyB: f32,
  isMirror: bool,
  isBarrier: bool,
};

fn intersectRaySegment(origin: vec2<f32>, dir: vec2<f32>, seg: SegmentPrimitive) -> HitInfo {
  var hit: HitInfo;
  hit.hit = false;
  hit.t = 1e9;

  let v1 = seg.p1;
  let v2 = seg.p2;
  let segDir = v2 - v1;
  let denom = dir.x * segDir.y - dir.y * segDir.x;

  if (abs(denom) < 1e-6) {
    return hit;
  }

  let d = v1 - origin;
  let t = (d.x * segDir.y - d.y * segDir.x) / denom;
  let u = (d.x * dir.y - d.y * dir.x) / denom;

  if (t > 1e-4 && u >= 0.0 && u <= 1.0) {
    hit.hit = true;
    hit.t = t;
    let n = normalize(vec2<f32>(-segDir.y, segDir.x));
    let isBackFace = (dot(dir, n) > 0.0);
    hit.normal = select(n, -n, isBackFace);
    if (isBackFace) {
      hit.n1 = seg.optics.y;
      hit.n2 = seg.optics.x;
    } else {
      hit.n1 = seg.optics.x;
      hit.n2 = seg.optics.y;
    }
    hit.cauchyA = seg.optics.z;
    hit.cauchyB = seg.optics.w;
    hit.isBarrier = (seg.optics.x == 0.0);
    hit.isMirror = (seg.optics.x <= -0.5);
  }

  return hit;
}

fn isAngleInArcWgsl(angle: f32, startAngle: f32, endAngle: f32) -> bool {
  let twoPi = 6.28318530718;
  if (abs(endAngle - startAngle) >= twoPi - 1e-5) {
    return true;
  }
  let a = angle - floor(angle / twoPi) * twoPi;
  let s = startAngle - floor(startAngle / twoPi) * twoPi;
  let e = endAngle - floor(endAngle / twoPi) * twoPi;

  if (s <= e) {
    return a >= s - 1e-5 && a <= e + 1e-5;
  }
  return a >= s - 1e-5 || a <= e + 1e-5;
}

// Ray-Arc Intersection (tests both roots t1 and t2 against angular sector & supports concave/convex)
fn intersectRayArc(origin: vec2<f32>, dir: vec2<f32>, arc: ArcPrimitive) -> HitInfo {
  var hit: HitInfo;
  hit.hit = false;
  hit.t = 1e9;

  if (arc.radius < 1e-4) {
    return hit;
  }

  let oc = origin - arc.center;
  let b = dot(oc, dir);
  let c = dot(oc, oc) - arc.radius * arc.radius;
  let disc = b * b - c;

  if (disc < 0.0) {
    return hit;
  }

  let sqrtDisc = sqrt(disc);
  let t1 = -b - sqrtDisc;
  let t2 = -b + sqrtDisc;

  var chosenT = -1.0;

  if (t1 > 1e-4) {
    let p1 = origin + dir * t1 - arc.center;
    let ang1 = atan2(p1.y, p1.x);
    if (isAngleInArcWgsl(ang1, arc.angles.x, arc.angles.y)) {
      chosenT = t1;
    }
  }

  if (chosenT < 0.0 && t2 > 1e-4) {
    let p2 = origin + dir * t2 - arc.center;
    let ang2 = atan2(p2.y, p2.x);
    if (isAngleInArcWgsl(ang2, arc.angles.x, arc.angles.y)) {
      chosenT = t2;
    }
  }

  if (chosenT > 1e-4) {
    let p = origin + dir * chosenT;
    let local = p - arc.center;
    hit.hit = true;
    hit.t = chosenT;
    let n = normalize(local);
    let isBackFace = (dot(dir, n) > 0.0);
    hit.normal = select(n, -n, isBackFace);

    let glassN = abs(arc.nGlass);
    let isConcave = (arc.nGlass < 0.0);
    let nInside = select(glassN, 1.0, isConcave);
    let nOutside = select(1.0, glassN, isConcave);

    if (isBackFace) {
      hit.n1 = nInside;
      hit.n2 = nOutside;
    } else {
      hit.n1 = nOutside;
      hit.n2 = nInside;
    }
    hit.cauchyA = arc.cauchy.x;
    hit.cauchyB = arc.cauchy.y;
    hit.isBarrier = false;
    hit.isMirror = false;
  }

  return hit;
}

// Bounding Box Slab Intersection
fn intersectAABB(origin: vec2<f32>, dir: vec2<f32>, aabbMin: vec2<f32>, aabbMax: vec2<f32>) -> bool {
  let safeX = select(dir.x, select(-1e-6, 1e-6, dir.x >= 0.0), abs(dir.x) < 1e-6);
  let safeY = select(dir.y, select(-1e-6, 1e-6, dir.y >= 0.0), abs(dir.y) < 1e-6);
  let invDirX = 1.0 / safeX;
  let invDirY = 1.0 / safeY;

  var t1 = (aabbMin.x - origin.x) * invDirX;
  var t2 = (aabbMax.x - origin.x) * invDirX;
  var tmin = min(t1, t2);
  var tmax = max(t1, t2);

  t1 = (aabbMin.y - origin.y) * invDirY;
  t2 = (aabbMax.y - origin.y) * invDirY;
  tmin = max(tmin, min(t1, t2));
  tmax = min(tmax, max(t1, t2));

  return tmax >= max(0.0, tmin);
}

// Schwarzschild Relativistic Geodesic Stepper (Strong-Field Numerical RK2)
fn stepSchwarzschildGeodesic(pos: vec2<f32>, dir: vec2<f32>, center: vec2<f32>, rs: f32, dt: f32) -> vec4<f32> {
  let rVec = pos - center;
  let rSq = dot(rVec, rVec);
  let r = sqrt(rSq);

  if (r <= rs) {
    return vec4<f32>(pos, 0.0, 0.0); // Absorbed by event horizon
  }

  let rInf = rs * 12.0;
  let rFadeStart = 10.0 * rs;
  let fade = select(1.0, smoothstep(rInf, rFadeStart, r), r > rFadeStart);
  let L1 = rVec.x * dir.y - rVec.y * dir.x;
  let L1Sq = L1 * L1 + 0.15 * rs * rs;
  let mag1 = -(1.55 * rs * L1Sq * fade) / (rSq * rSq * r);
  let a1 = rVec * mag1;

  // RK2 Midpoint Step
  let midPos = pos + dir * (0.5 * dt) + a1 * (0.25 * dt * dt);
  let midVel = normalize(dir + a1 * (0.5 * dt));

  let midRVec = midPos - center;
  let midRSq = dot(midRVec, midRVec);
  let midR = sqrt(midRSq);
  if (midR <= rs) {
    return vec4<f32>(midPos, 0.0, 0.0);
  }
  let mFade = select(1.0, smoothstep(rInf, rFadeStart, midR), midR > rFadeStart);
  let L2 = midRVec.x * midVel.y - midRVec.y * midVel.x;
  let L2Sq = L2 * L2 + 0.15 * rs * rs;
  let mag2 = -(1.55 * rs * L2Sq * mFade) / (midRSq * midRSq * midR);
  let a2 = midRVec * mag2;

  let newPos = pos + midVel * dt;
  let newDir = normalize(dir + a2 * dt);

  return vec4<f32>(newPos, newDir);
}

// Hybrid Relativistic Evaluator: Analytic Einstein Deflection (r > 8.0 * rs -> 2.0 * rs / b asymptotic limit) + Strong-Field RK2
fn evaluateBlackHoleInteraction(pos: vec2<f32>, dir: vec2<f32>, bh: BlackHolePrimitive, dt: f32) -> vec4<f32> {
  let rVec = pos - bh.center;
  let r = length(rVec);
  let rs = bh.radii.x;
  let rInf = bh.radii.y;

  if (r > rInf) {
    return vec4<f32>(pos + dir * dt, dir);
  }

  if (r <= rs) {
    return vec4<f32>(pos, 0.0, 0.0);
  }

  // Multi-substep RK2 integration matching CPU mcPhotonTracer.ts (up to 4 microsteps per segment)
  var p = pos;
  var d = dir;
  let subDt = dt * 0.25;
  for (var s = 0u; s < 4u; s = s + 1u) {
    let stepRes = stepSchwarzschildGeodesic(p, d, bh.center, rs, subDt);
    p = stepRes.xy;
    d = stepRes.zw;
    if (length(d) < 0.1 || length(p - bh.center) <= rs) {
      return vec4<f32>(p, 0.0, 0.0);
    }
  }
  return vec4<f32>(p, d);
}

// 8-Element Short-Stack BVH Traversal
fn traverseBVH(origin: vec2<f32>, dir: vec2<f32>) -> HitInfo {
  var bestHit: HitInfo;
  bestHit.hit = false;
  bestHit.t = 1e9;

  let numNodes = config.counts.x;
  if (numNodes == 0u) {
    let numSegs = config.counts.y;
    for (var s = 0u; s < numSegs; s = s + 1u) {
      let h = intersectRaySegment(origin, dir, segments[s]);
      if (h.hit && h.t < bestHit.t) {
        bestHit = h;
      }
    }
    let numArcs = config.counts.z;
    for (var a = 0u; a < numArcs; a = a + 1u) {
      let h = intersectRayArc(origin, dir, arcs[a]);
      if (h.hit && h.t < bestHit.t) {
        bestHit = h;
      }
    }
    return bestHit;
  }

  var stack: array<u32, 8>;
  var stackPtr = 0u;
  stack[stackPtr] = 0u;
  stackPtr = stackPtr + 1u;

  while (stackPtr > 0u) {
    stackPtr = stackPtr - 1u;
    let nodeIdx = stack[stackPtr];
    let node = bvhNodes[nodeIdx];

    if (!intersectAABB(origin, dir, node.aabbMin, node.aabbMax)) {
      continue;
    }

    if (node.leftChild == 0u) {
      // Leaf Node
      if (node.primType == 0u) {
        let h = intersectRaySegment(origin, dir, segments[node.primIndex]);
        if (h.hit && h.t < bestHit.t) {
          bestHit = h;
        }
      } else if (node.primType == 1u) {
        let h = intersectRayArc(origin, dir, arcs[node.primIndex]);
        if (h.hit && h.t < bestHit.t) {
          bestHit = h;
        }
      }
    } else {
      // Internal Node: push children to stack (max 8)
      if (stackPtr < 7u) {
        stack[stackPtr] = node.rightChildOrCount;
        stackPtr = stackPtr + 1u;
        stack[stackPtr] = node.leftChild;
        stackPtr = stackPtr + 1u;
      }
    }
  }

  return bestHit;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let photonIdx = global_id.x;
  if (photonIdx >= config.batchPhotons || config.emitterCount == 0u) {
    return;
  }

  let maxBounces = u32(config.params.y);
  let baseVertexIdx = photonIdx * maxBounces * 2u;

  let passSeed = u32(config.params.w);
  let baseSeed = u32(config.params.x);
  var rng = pcg32_init(photonIdx ^ (passSeed * 10007u), baseSeed + passSeed * 9781u + photonIdx * 65537u);

  // 1. Pick Emitter & Sample Initial State (matching CPU renderWorker.ts)
  let emIdx = u32(pcg32_next(&rng) * f32(config.emitterCount)) % config.emitterCount;
  let emitter = emitters[emIdx];

  let emWidth = emitter.params.x;
  let offsetDist = (pcg32_next(&rng) - 0.5) * emWidth;
  let perpDir = vec2<f32>(-emitter.dir.y, emitter.dir.x);

  var curPos = emitter.pos + perpDir * offsetDist;
  var curDir = normalize(emitter.dir);
  var energy = emitter.params.w;
  var wavelength = 550.0;

  let specType = u32(emitter.params.y);
  if (specType == 0u) {
    wavelength = emitter.params.z; // Monochromatic
  } else if (specType == 1u) {
    wavelength = sampleD65WavelengthWgsl(&rng); // D65 Daylight SPD
  } else {
    wavelength = 380.0 + pcg32_next(&rng) * 400.0; // Continuous spectrum
  }

  var color = wavelengthToXYZ(wavelength);

  // Volumetric medium parameters matching CPU sceneSnapshot.ts (sigmaA=0.0005, sigmaS=0.002 -> sigmaT=0.0025, albedo=0.8, g=0.25)
  let paramZ = config.params.z;
  let sigmaT = select(paramZ, 0.0025, paramZ >= 0.05);
  let albedo = 0.8;
  let g = 0.25;

  // 2. Trace Bounces
  var bounce = 0u;
  let numBH = config.counts.w;

  while (bounce < maxBounces && energy > 1e-4) {
    let outSlot0 = baseVertexIdx + bounce * 2u;
    let outSlot1 = baseVertexIdx + bounce * 2u + 1u;

    // Find closest intersection
    var closestT = 10000.0;
    var bestHit: HitInfo;
    bestHit.hit = false;

    // Boundary check
    var boundDist = 10000.0;
    let b = config.bounds;
    if (curDir.x > 1e-6) { boundDist = min(boundDist, (b.z - curPos.x) / curDir.x); }
    else if (curDir.x < -1e-6) { boundDist = min(boundDist, (b.x - curPos.x) / curDir.x); }
    if (curDir.y > 1e-6) { boundDist = min(boundDist, (b.w - curPos.y) / curDir.y); }
    else if (curDir.y < -1e-6) { boundDist = min(boundDist, (b.y - curPos.y) / curDir.y); }
    boundDist = max(0.0, boundDist);

    // Intersect scene geometry
    bestHit = traverseBVH(curPos, curDir);
    closestT = boundDist;
    if (bestHit.hit && bestHit.t < boundDist) {
      closestT = bestHit.t;
    } else {
      bestHit.hit = false;
    }

    // Check Black Hole Relativistic Geodesic Interaction
    var activeBhIdx = -1;
    var bhEntryT = closestT;
    if (numBH > 0u) {
      for (var bi = 0u; bi < numBH; bi = bi + 1u) {
        let bh = blackHoles[bi];
        let oc = curPos - bh.center;
        let r = length(oc);
        let rInf = bh.radii.y;
        if (r < rInf - 1e-2) {
          activeBhIdx = i32(bi);
          bhEntryT = 0.0;
          break;
        } else {
          let bDot = dot(oc, curDir);
          let cVal = dot(oc, oc) - rInf * rInf;
          let disc = bDot * bDot - cVal;
          if (disc > 0.0) {
            let tEnter = -bDot - sqrt(disc);
            if (tEnter > 1e-3 && tEnter < bhEntryT) {
              bhEntryT = tEnter;
              activeBhIdx = i32(bi);
            } else if (r <= rInf + 1e-2 && bDot < 0.0) {
              bhEntryT = 0.0;
              activeBhIdx = i32(bi);
              break;
            }
          }
        }
      }
    }

    if (activeBhIdx >= 0 && bhEntryT <= 1e-3) {
      let bh = blackHoles[u32(activeBhIdx)];
      let rNow = length(curPos - bh.center);
      let rs = bh.radii.x;
      let stepDt = min(closestT, clamp(0.22 * (rNow - rs * 0.85), 2.5, 18.0));
      let geoStep = evaluateBlackHoleInteraction(curPos, curDir, bh, stepDt);
      let nextPos = geoStep.xy;
      let nextDir = geoStep.zw;

      let nextR = max(rs * 1.01, length(nextPos - bh.center));
      let gravRatio = rs / nextR;
      let shiftedWl = wavelength + 32.0 * pow(gravRatio, 2.5);
      let shiftedColor = wavelengthToXYZ(shiftedWl);

      let phDelta = (nextR - 1.42 * rs) / (0.32 * rs);
      let horizonFade = pow(clamp((nextR - rs) / (0.35 * rs), 0.0, 1.0), 0.75);
      let lensingBoost = (1.0 + 3.2 * exp(-phDelta * phDelta)) * horizonFade;
      let stepFlux = ((energy * energy) / 320.0) * lensingBoost;
      photonVertices[outSlot0] = PhotonVertex(curPos, shiftedWl, 0u, shiftedColor, stepFlux);
      photonVertices[outSlot1] = PhotonVertex(nextPos, shiftedWl, 0u, shiftedColor, stepFlux);

      curPos = nextPos;
      curDir = nextDir;
      bounce = bounce + 1u;

      if (length(curDir) < 0.1 || length(curPos - bh.center) <= rs) {
        energy = 0.0;
        break;
      }
      continue;
    }

    var entersBhBoundary = false;
    if (activeBhIdx >= 0 && bhEntryT < closestT) {
      closestT = bhEntryT;
      bestHit.hit = false;
      entersBhBoundary = true;
    }

    // Physical volumetric in-scattering matching CPU mcPhotonTracer.ts
    var didScatter = false;
    if (sigmaT > 1e-6) {
      let xiScatter = pcg32_next(&rng);
      let scatterDist = -log(max(1e-7, 1.0 - xiScatter)) / sigmaT;
      if (scatterDist < closestT) {
        closestT = scatterDist;
        didScatter = true;
        entersBhBoundary = false;
      }
    }

    let straightNextPos = curPos + curDir * closestT;
    var nextPos = straightNextPos;
    var nextDir = curDir;

    // Ensure blackHoles[0] and config.counts.w are statically referenced for auto bind group layout
    if (config.counts.w > 999999u) {
      nextPos = blackHoles[0].center;
    }

    // Output active line segment with exact CPU-equivalent length-weighted flux
    // (or continuous 1/320.0 density in Black Hole scenes so r = 12 * rs has zero boundary seam)
    let segmentFlux = (energy * energy) / max(1.0, closestT);
    let outFlux = select(segmentFlux, (energy * energy) / 320.0, numBH > 0u);
    photonVertices[outSlot0] = PhotonVertex(curPos, wavelength, 0u, color, outFlux);
    photonVertices[outSlot1] = PhotonVertex(nextPos, wavelength, 0u, color, outFlux);

    curPos = nextPos;
    curDir = nextDir;

    if (entersBhBoundary) {
      curPos = curPos + curDir * 0.05;
      bounce = bounce + 1u;
      continue;
    }

    if (didScatter) {
      // Henyey-Greenstein scattering matching CPU volumetricMedium.ts
      let xiTheta = pcg32_next(&rng);
      let sq = (1.0 - g * g) / (1.0 - g + 2.0 * g * xiTheta);
      let cosTheta = clamp((1.0 + g * g - sq * sq) / (2.0 * g), -1.0, 1.0);
      let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta)) * select(-1.0, 1.0, pcg32_next(&rng) > 0.5);

      let newX = curDir.x * cosTheta - curDir.y * sinTheta;
      let newY = curDir.x * sinTheta + curDir.y * cosTheta;
      curDir = normalize(vec2<f32>(newX, newY));
      energy = energy * albedo;
      bounce = bounce + 1u;

      if (energy < 0.2) {
        if (pcg32_next(&rng) > energy * 5.0) {
          energy = 0.0;
          break;
        }
        energy = 0.2;
      }
      continue;
    }

    if (length(curDir) < 0.1) {
      energy = 0.0;
      bounce = bounce + 1u;
      break;
    }

    if (!bestHit.hit) {
      bounce = bounce + 1u;
      break;
    }

    if (bestHit.isBarrier) {
      energy = 0.0;
      bounce = bounce + 1u;
      break;
    }

    if (bestHit.isMirror) {
      curDir = reflect(curDir, bestHit.normal);
      curPos = curPos + bestHit.normal * 0.01;
      bounce = bounce + 1u;
      continue;
    }

    // Dielectric Refraction / Reflection matching CPU mcPhotonTracer.ts
    let n1 = select(1.0, evaluateCauchy(wavelength, bestHit.cauchyA, bestHit.cauchyB), bestHit.n1 > 1.05);
    let n2 = select(1.0, evaluateCauchy(wavelength, bestHit.cauchyA, bestHit.cauchyB), bestHit.n2 > 1.05);
    let eta = n1 / n2;

    let cosI = clamp(-dot(bestHit.normal, curDir), 0.0, 1.0);
    let sinT2 = eta * eta * (1.0 - cosI * cosI);

    if (sinT2 >= 1.0) {
      // Total Internal Reflection (TIR)
      curDir = reflect(curDir, bestHit.normal);
      curPos = curPos + bestHit.normal * 0.01;
    } else {
      let cosT = sqrt(max(0.0, 1.0 - sinT2));
      let rPerp = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
      let rPar = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);
      let R = 0.5 * (rPerp * rPerp + rPar * rPar);

      let xi = pcg32_next(&rng);
      if (xi < R) {
        curDir = reflect(curDir, bestHit.normal);
        curPos = curPos + bestHit.normal * 0.01;
      } else {
        curDir = normalize(eta * curDir + (eta * cosI - cosT) * bestHit.normal);
        curPos = curPos - bestHit.normal * 0.01;
      }
    }

    // Russian Roulette survival
    if (energy < 0.1) {
      let p = max(0.1, energy * 10.0);
      if (pcg32_next(&rng) > p) {
        energy = 0.0;
        bounce = bounce + 1u;
        break;
      }
      energy = energy / p;
    }

    bounce = bounce + 1u;
  }

  // Culled padding for unreached bounces
  while (bounce < maxBounces) {
    let outSlot0 = baseVertexIdx + bounce * 2u;
    let outSlot1 = baseVertexIdx + bounce * 2u + 1u;
    photonVertices[outSlot0] = PhotonVertex(vec2<f32>(0.0, 0.0), 0.0, 1u, vec3<f32>(0.0), 0.0);
    photonVertices[outSlot1] = PhotonVertex(vec2<f32>(0.0, 0.0), 0.0, 1u, vec3<f32>(0.0), 0.0);
    bounce = bounce + 1u;
  }
}
`;

export const CLIP_RASTER_WGSL = /* wgsl */ `
struct UniformSceneConfig {
  bounds: vec4<f32>,     // minX, minY, maxX, maxY
  counts: vec4<u32>,
  params: vec4<f32>,
  renderDim: vec2<f32>,
  batchPhotons: u32,
  emitterCount: u32,
};

struct PhotonVertex {
  pos: vec2<f32>,
  wavelength: f32,
  flags: u32,
  color: vec3<f32>,
  energy: f32,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> config: UniformSceneConfig;
@group(0) @binding(1) var<storage, read> photonVertices: array<PhotonVertex>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIdx: u32) -> VertexOutput {
  var out: VertexOutput;
  let v = photonVertices[vertexIdx];

  // Hardware Clip-Culling: Only discard dead segments (flags != 0) or strictly zero energy
  if (v.flags != 0u || v.energy <= 1e-9) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 0.0); // outOfClip
    out.color = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return out;
  }

  let b = config.bounds;
  let ndcX = ((v.pos.x - b.x) / (b.z - b.x)) * 2.0 - 1.0;
  let ndcY = 1.0 - ((v.pos.y - b.y) / (b.w - b.y)) * 2.0;

  // Match CPU per-pixel radiance (0.1 * v.color * v.energy) pre-scaled by 16.0 to prevent rgba16float mantissa underflow
  let scaledWeight = v.energy * (0.1 * 16.0);
  out.position = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.color = vec4<f32>(v.color * scaledWeight, scaledWeight);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  return in.color;
}
`;

export class GpuPipelineManager {
  readonly device: GPUDevice;
  private computePipeline: GPUComputePipeline | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private buffers: { [key: string]: GPUBuffer } = {};
  private bindGroupCompute: GPUBindGroup | null = null;
  private bindGroupRender: GPUBindGroup | null = null;

  private batchSize = 100000;
  private allocatedBatchSize = 65536;
  private maxBounces = 32;
  private minBatchSize = 25000;
  private maxBatchSize = 500000;

  constructor(device: GPUDevice) {
    this.device = device;
    this.initPipelines();
  }

  getBatchSize(): number {
    return this.batchSize;
  }

  getMaxBounces(): number {
    return this.maxBounces;
  }

  setBatchSize(size: number): void {
    const cap = this.buffers.vertices ? this.allocatedBatchSize : this.maxBatchSize;
    this.batchSize = Math.max(this.minBatchSize, Math.min(cap, size));
    this.syncBatchSizeUniform();
  }

  private syncBatchSizeUniform(): void {
    if (this.buffers.uniform) {
      this.device.queue.writeBuffer(
        this.buffers.uniform,
        56,
        new Uint32Array([this.batchSize])
      );
    }
  }

  /**
   * Updates the per-pass seed in the uniform buffer to ensure Monte Carlo variation across passes.
   */
  updatePassSeed(passIndex: number): void {
    if (this.buffers.uniform) {
      const passSeed = ((passIndex * 1664525 + 1013904223) ^ Math.floor(Math.random() * 0x7fffff)) & 0x7fffff;
      this.device.queue.writeBuffer(
        this.buffers.uniform,
        44,
        new Float32Array([passSeed])
      );
    }
  }

  /**
   * Dynamically adjusts micro-batch size based on frame execution time to sustain ~60 FPS.
   */
  adjustBatchPacing(elapsedMs: number): void {
    const targetMs = 12.0;
    const cap = this.buffers.vertices ? this.allocatedBatchSize : this.maxBatchSize;
    if (elapsedMs < targetMs * 0.7) {
      this.batchSize = Math.min(cap, Math.floor(this.batchSize * 1.25));
      this.syncBatchSizeUniform();
    } else if (elapsedMs > targetMs * 1.5) {
      this.batchSize = Math.max(this.minBatchSize, Math.floor(this.batchSize * 0.8));
      this.syncBatchSizeUniform();
    }
  }

  private initPipelines(): void {
    const computeShader = this.device.createShaderModule({
      label: 'PhotonTransportComputeShader',
      code: PHOTON_TRANSPORT_WGSL
    });

    this.computePipeline = this.device.createComputePipeline({
      label: 'PhotonTransportComputePipeline',
      layout: 'auto',
      compute: {
        module: computeShader,
        entryPoint: 'main'
      }
    });

    const rasterShader = this.device.createShaderModule({
      label: 'ClipRasterShader',
      code: CLIP_RASTER_WGSL
    });

    this.renderPipeline = this.device.createRenderPipeline({
      label: 'ClipRasterRenderPipeline',
      layout: 'auto',
      vertex: {
        module: rasterShader,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: rasterShader,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.device.features?.has('float32-blendable' as GPUFeatureName)
              ? 'rgba32float'
              : 'rgba16float',
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one',
                operation: 'add'
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one',
                operation: 'add'
              }
            }
          }
        ]
      },
      primitive: {
        topology: 'line-list'
      }
    });
  }

  /**
   * Uploads scene SSBOs and rebuilds bind groups for the current scene snapshot.
   */
  updateScene(
    scene: IOfflineSceneGeometry,
    batchPhotons = this.batchSize,
    maxBounces = 32,
    volumetricInScatter = true
  ): void {
    this.maxBounces = Math.max(4, Math.min(32, maxBounces));
    const maxStorageBytes = this.device.limits?.maxStorageBufferBindingSize ?? 134217728;
    const bytesPerPhoton = this.maxBounces * 2 * PHOTON_VERTEX_STRIDE_BYTES;
    const maxHardwarePhotons = Math.max(1024, Math.floor(maxStorageBytes / bytesPerPhoton));

    this.batchSize = Math.min(batchPhotons, maxHardwarePhotons);
    this.allocatedBatchSize = Math.min(maxHardwarePhotons, Math.max(this.batchSize * 2, 50000));

    const bvhResult = buildGpuBVH(scene);
    const packed = packSceneBuffers(scene, this.batchSize, this.maxBounces, Date.now(), volumetricInScatter);

    this.destroyBuffers();

    // 1. Create GPU Buffers
    this.buffers.bvh = this.createStorageBuffer('bvhNodes', bvhResult.bvhBuffer);
    this.buffers.segments = this.createStorageBuffer('segments', packed.segmentBuffer);
    this.buffers.arcs = this.createStorageBuffer('arcs', packed.arcBuffer);
    this.buffers.blackHoles = this.createStorageBuffer('blackHoles', packed.blackHoleBuffer);
    this.buffers.emitters = this.createStorageBuffer('emitters', packed.emitterBuffer);

    // Uniform Buffer
    this.buffers.uniform = this.device.createBuffer({
      label: 'uniformConfig',
      size: packed.uniformBuffer.byteLength,
      usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.buffers.uniform, 0, packed.uniformBuffer);

    // Output Photon Vertex Buffer
    const vertexBufferSize = this.allocatedBatchSize * this.maxBounces * 2 * PHOTON_VERTEX_STRIDE_BYTES;
    this.buffers.vertices = this.device.createBuffer({
      label: 'photonVertices',
      size: vertexBufferSize,
      usage: BufferUsage.STORAGE | BufferUsage.VERTEX | BufferUsage.COPY_SRC
    });

    // 2. Create Compute Bind Group
    if (this.computePipeline) {
      this.bindGroupCompute = this.device.createBindGroup({
        label: 'ComputeBindGroup',
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.bvh } },
          { binding: 1, resource: { buffer: this.buffers.segments } },
          { binding: 2, resource: { buffer: this.buffers.arcs } },
          { binding: 3, resource: { buffer: this.buffers.blackHoles } },
          { binding: 4, resource: { buffer: this.buffers.emitters } },
          { binding: 5, resource: { buffer: this.buffers.uniform } },
          { binding: 6, resource: { buffer: this.buffers.vertices } }
        ]
      });
    }

    // 3. Create Render Bind Group
    if (this.renderPipeline) {
      this.bindGroupRender = this.device.createBindGroup({
        label: 'RenderBindGroup',
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.uniform } },
          { binding: 1, resource: { buffer: this.buffers.vertices } }
        ]
      });
    }
  }

  private createStorageBuffer(label: string, data: ArrayBuffer): GPUBuffer {
    const buffer = this.device.createBuffer({
      label,
      size: Math.max(16, data.byteLength),
      usage: BufferUsage.STORAGE | BufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  getComputePipeline(): GPUComputePipeline | null {
    return this.computePipeline;
  }

  getRenderPipeline(): GPURenderPipeline | null {
    return this.renderPipeline;
  }

  getComputeBindGroup(): GPUBindGroup | null {
    return this.bindGroupCompute;
  }

  getRenderBindGroup(): GPUBindGroup | null {
    return this.bindGroupRender;
  }

  private destroyBuffers(): void {
    for (const key in this.buffers) {
      try {
        this.buffers[key].destroy();
      } catch {}
    }
    this.buffers = {};
  }

  destroy(): void {
    this.destroyBuffers();
    this.computePipeline = null;
    this.renderPipeline = null;
    this.bindGroupCompute = null;
    this.bindGroupRender = null;
  }
}

export function createWebGpuComputePipeline(device: GPUDevice): GPUComputePipeline {
  const module = device.createShaderModule({ code: PHOTON_TRANSPORT_WGSL });
  return device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' }
  });
}

export function createWebGpuRenderPipeline(device: GPUDevice, format: GPUTextureFormat = 'rgba16float'): GPURenderPipeline {
  const module = device.createShaderModule({ code: CLIP_RASTER_WGSL });
  return device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs_main' },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
          }
        }
      ]
    },
    primitive: { topology: 'line-list' }
  });
}

export function generatePhotonTransportWgsl(_options?: { maxBounces?: number; workgroupSize?: number }): string {
  return PHOTON_TRANSPORT_WGSL;
}
