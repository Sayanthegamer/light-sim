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
  nGlass: f32,
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
  params: vec4<f32>,     // seed, maxBounces, russianRouletteThreshold, pad
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

// Analytic CIE 1931 RGB Color Matching
fn wavelengthToRGB(lambda: f32) -> vec3<f32> {
  var r = 0.0;
  var g = 0.0;
  var b = 0.0;

  if (lambda >= 380.0 && lambda < 440.0) {
    r = -(lambda - 440.0) / (440.0 - 380.0);
    g = 0.0;
    b = 1.0;
  } else if (lambda >= 440.0 && lambda < 490.0) {
    r = 0.0;
    g = (lambda - 440.0) / (490.0 - 440.0);
    b = 1.0;
  } else if (lambda >= 490.0 && lambda < 510.0) {
    r = 0.0;
    g = 1.0;
    b = -(lambda - 510.0) / (510.0 - 490.0);
  } else if (lambda >= 510.0 && lambda < 580.0) {
    r = (lambda - 510.0) / (580.0 - 510.0);
    g = 1.0;
    b = 0.0;
  } else if (lambda >= 580.0 && lambda < 645.0) {
    r = 1.0;
    g = -(lambda - 645.0) / (645.0 - 580.0);
    b = 0.0;
  } else if (lambda >= 645.0 && lambda <= 780.0) {
    r = 1.0;
    g = 0.0;
    b = 0.0;
  }

  var factor = 0.0;
  if (lambda >= 380.0 && lambda < 420.0) {
    factor = 0.3 + 0.7 * (lambda - 380.0) / (420.0 - 380.0);
  } else if (lambda >= 420.0 && lambda <= 700.0) {
    factor = 1.0;
  } else if (lambda > 700.0 && lambda <= 780.0) {
    factor = 0.3 + 0.7 * (780.0 - lambda) / (780.0 - 700.0);
  }

  return vec3<f32>(r * factor, g * factor, b * factor);
}

fn evaluateCauchy(lambdaNm: f32, a: f32, b: f32) -> f32 {
  return a + (b / (lambdaNm * lambdaNm));
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

  if (t > 0.01 && u >= 0.0 && u <= 1.0) {
    hit.hit = true;
    hit.t = t;
    let n = normalize(vec2<f32>(-segDir.y, segDir.x));
    hit.normal = select(-n, n, dot(dir, n) < 0.0);
    hit.n1 = seg.optics.x;
    hit.n2 = seg.optics.y;
    hit.cauchyA = seg.optics.z;
    hit.cauchyB = seg.optics.w;
    hit.isBarrier = (seg.optics.x == 0.0);
    hit.isMirror = (seg.optics.x <= -0.5);
  }

  return hit;
}

// Ray-Arc Intersection
fn intersectRayArc(origin: vec2<f32>, dir: vec2<f32>, arc: ArcPrimitive) -> HitInfo {
  var hit: HitInfo;
  hit.hit = false;
  hit.t = 1e9;

  let oc = origin - arc.center;
  let b = dot(oc, dir);
  let c = dot(oc, oc) - arc.radius * arc.radius;
  let disc = b * b - c;

  if (disc < 0.0) {
    return hit;
  }

  let sqrtDisc = sqrt(disc);
  var t = -b - sqrtDisc;
  if (t < 0.01) {
    t = -b + sqrtDisc;
  }

  if (t > 0.01) {
    let p = origin + dir * t;
    let local = p - arc.center;
    var ang = atan2(local.y, local.x);

    // Normalize angle to [0, 2pi]
    let twoPi = 6.28318530718;
    var start = arc.angles.x;
    var end = arc.angles.y;

    if (start < 0.0) { start = start + twoPi; }
    if (end < 0.0) { end = end + twoPi; }
    if (ang < 0.0) { ang = ang + twoPi; }

    var inside = false;
    if (start <= end) {
      inside = (ang >= start && ang <= end);
    } else {
      inside = (ang >= start || ang <= end);
    }

    if (inside) {
      hit.hit = true;
      hit.t = t;
      let n = normalize(local);
      hit.normal = select(-n, n, dot(dir, n) < 0.0);
      hit.n1 = 1.0;
      hit.n2 = arc.nGlass;
      hit.cauchyA = arc.cauchy.x;
      hit.cauchyB = arc.cauchy.y;
      hit.isBarrier = false;
      hit.isMirror = false;
    }
  }

  return hit;
}

// Bounding Box Slab Intersection
fn intersectAABB(origin: vec2<f32>, dir: vec2<f32>, aabbMin: vec2<f32>, aabbMax: vec2<f32>) -> bool {
  let invDirX = 1.0 / select(dir.x, 1e-6, abs(dir.x) < 1e-6);
  let invDirY = 1.0 / select(dir.y, 1e-6, abs(dir.y) < 1e-6);

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
  let r = length(rVec);

  if (r <= rs) {
    return vec4<f32>(pos, 0.0, 0.0); // Absorbed by event horizon
  }

  let L = rVec.x * dir.y - rVec.y * dir.x;
  let L2 = L * L;
  let r5 = r * r * r * r * r;
  let accel = -1.5 * rs * L2 * rVec / r5;

  // RK2 Midpoint Step
  let midPos = pos + dir * (0.5 * dt);
  let midVel = dir + accel * (0.5 * dt);

  let midRVec = midPos - center;
  let midR = length(midRVec);
  let midR5 = midR * midR * midR * midR * midR;
  let midAccel = -1.5 * rs * L2 * midRVec / midR5;

  let newPos = pos + midVel * dt;
  let newDir = normalize(dir + midAccel * dt);

  return vec4<f32>(newPos, newDir);
}

// Hybrid Relativistic Evaluator: Analytic Einstein Deflection (r > 8*rs) + Numerical RK2 (r <= 8*rs)
fn evaluateBlackHoleInteraction(pos: vec2<f32>, dir: vec2<f32>, bh: BlackHolePrimitive, dt: f32) -> vec4<f32> {
  let rVec = pos - bh.center;
  let r = length(rVec);
  let rs = bh.radii.x;
  let rInf = bh.radii.y;

  if (r > rInf) {
    return vec4<f32>(pos + dir * dt, dir);
  }

  // Event Horizon Absorption
  if (r <= rs) {
    return vec4<f32>(pos, 0.0, 0.0);
  }

  // Weak-Field Regime: r > 8.0 * rs -> Analytic Einstein Deflection O(1) with C^inf continuity
  if (r > 8.0 * rs) {
    let perp = normalize(vec2<f32>(-rVec.y, rVec.x));
    let signL = select(-1.0, 1.0, dot(perp, dir) > 0.0);
    let b = max(rs * 1.5, abs(rVec.x * dir.y - rVec.y * dir.x));
    let deltaTheta = (2.0 * rs / b) * (dt / r);
    let cosD = cos(deltaTheta * signL);
    let sinD = sin(deltaTheta * signL);
    let newDir = normalize(vec2<f32>(dir.x * cosD - dir.y * sinD, dir.x * sinD + dir.y * cosD));
    return vec4<f32>(pos + newDir * dt, newDir);
  }

  // Strong-to-Intermediate Regime: rs < r <= 8.0 * rs -> Numerical RK2 Stepping with Adaptive Step Size
  let dynamicDt = clamp(0.15 * r, 0.05 * rs, 2.0 * rs);
  return stepSchwarzschildGeodesic(pos, dir, bh.center, rs, min(dt, dynamicDt));
}

// 8-Element Short-Stack BVH Traversal
fn traverseBVH(origin: vec2<f32>, dir: vec2<f32>) -> HitInfo {
  var bestHit: HitInfo;
  bestHit.hit = false;
  bestHit.t = 1e9;

  let numNodes = config.counts.x;
  if (numNodes == 0u) {
    // Linear fallback if no BVH nodes
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

  var rng = pcg32_init(photonIdx, u32(config.params.x) + photonIdx * 17u);

  // 1. Pick Emitter & Sample Initial State
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
  } else {
    wavelength = 380.0 + pcg32_next(&rng) * 400.0; // Continuous spectrum
  }

  var color = wavelengthToRGB(wavelength);

  // 2. Trace Bounces
  var bounce = 0u;
  while (bounce < maxBounces && energy > 0.005) {
    let outSlot0 = baseVertexIdx + bounce * 2u;
    let outSlot1 = baseVertexIdx + bounce * 2u + 1u;

    // Find closest intersection
    var closestT = 1000.0;
    var bestHit: HitInfo;
    bestHit.hit = false;

    // Boundary check
    var boundDist = 1000.0;
    let b = config.bounds;
    if (curDir.x > 1e-6) { boundDist = min(boundDist, (b.z - curPos.x) / curDir.x); }
    else if (curDir.x < -1e-6) { boundDist = min(boundDist, (b.x - curPos.x) / curDir.x); }
    if (curDir.y > 1e-6) { boundDist = min(boundDist, (b.w - curPos.y) / curDir.y); }
    else if (curDir.y < -1e-6) { boundDist = min(boundDist, (b.y - curPos.y) / curDir.y); }

    // Intersect scene geometry via short-stack BVH
    bestHit = traverseBVH(curPos, curDir);
    closestT = boundDist;
    if (bestHit.hit && bestHit.t < boundDist) {
      closestT = bestHit.t;
    } else {
      bestHit.hit = false;
    }

    let straightNextPos = curPos + curDir * closestT;
    var nextPos = straightNextPos;
    var nextDir = curDir;

    let numBH = config.counts.w;
    for (var i = 0u; i < numBH; i = i + 1u) {
      let bhResult = evaluateBlackHoleInteraction(curPos, curDir, blackHoles[i], closestT);
      if (length(bhResult.zw) < 0.5 || distance(bhResult.xy, straightNextPos) > 1e-4) {
        nextPos = bhResult.xy;
        nextDir = bhResult.zw;
      }
    }

    // Output active line segment
    photonVertices[outSlot0] = PhotonVertex(curPos, wavelength, 0u, color, energy);
    photonVertices[outSlot1] = PhotonVertex(nextPos, wavelength, 0u, color, energy);

    curPos = nextPos;
    curDir = nextDir;

    if (length(curDir) < 0.1) {
      // Absorbed by event horizon
      energy = 0.0;
      bounce = bounce + 1u;
      break;
    }

    if (!bestHit.hit) {
      // Escaped boundaries
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
      curPos = curPos + bestHit.normal * 0.05;
      bounce = bounce + 1u;
      continue;
    }

    // Dielectric Refraction / Reflection
    let n1 = select(1.0, evaluateCauchy(wavelength, bestHit.cauchyA, bestHit.cauchyB), bestHit.n1 > 1.05);
    let n2 = select(1.0, evaluateCauchy(wavelength, bestHit.cauchyA, bestHit.cauchyB), bestHit.n2 > 1.05);
    let eta = n1 / n2;

    let cosI = -dot(bestHit.normal, curDir);
    let sinT2 = eta * eta * (1.0 - cosI * cosI);

    if (sinT2 > 1.0) {
      // Total Internal Reflection (TIR)
      curDir = reflect(curDir, bestHit.normal);
      curPos = curPos + bestHit.normal * 0.05;
    } else {
      let cosT = sqrt(1.0 - sinT2);
      let rPerp = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
      let rPar = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);
      let R = 0.5 * (rPerp * rPerp + rPar * rPar);

      let xi = pcg32_next(&rng);
      if (xi < R) {
        curDir = reflect(curDir, bestHit.normal);
        curPos = curPos + bestHit.normal * 0.05;
      } else {
        curDir = normalize(eta * curDir + (eta * cosI - cosT) * bestHit.normal);
        curPos = curPos - bestHit.normal * 0.05;
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

  // Hardware Clip-Culling: Discard dead segments with w=0 out-of-clip coordinates
  if (v.flags != 0u || v.energy <= 1e-4) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 0.0); // outOfClip
    out.color = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return out;
  }

  let b = config.bounds;
  let ndcX = ((v.pos.x - b.x) / (b.z - b.x)) * 2.0 - 1.0;
  let ndcY = 1.0 - ((v.pos.y - b.y) / (b.w - b.y)) * 2.0;

  out.position = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.color = vec4<f32>(v.color * v.energy * 0.005, 1.0);
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

  private batchSize = 25000;
  private minBatchSize = 5000;
  private maxBatchSize = 100000;

  constructor(device: GPUDevice) {
    this.device = device;
    this.initPipelines();
  }

  getBatchSize(): number {
    return this.batchSize;
  }

  setBatchSize(size: number): void {
    this.batchSize = Math.max(this.minBatchSize, Math.min(this.maxBatchSize, size));
  }

  /**
   * Dynamically adjusts micro-batch size based on frame execution time to sustain ~60 FPS.
   */
  adjustBatchPacing(elapsedMs: number): void {
    const targetMs = 12.0;
    if (elapsedMs < targetMs * 0.7) {
      this.batchSize = Math.min(this.maxBatchSize, Math.floor(this.batchSize * 1.25));
    } else if (elapsedMs > targetMs * 1.5) {
      this.batchSize = Math.max(this.minBatchSize, Math.floor(this.batchSize * 0.8));
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
            format: 'rgba16float',
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
  updateScene(scene: IOfflineSceneGeometry, batchPhotons = this.batchSize, maxBounces = 32): void {
    this.batchSize = batchPhotons;
    const bvhResult = buildGpuBVH(scene);
    const packed = packSceneBuffers(scene, this.batchSize, maxBounces);

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
    const vertexBufferSize = this.batchSize * maxBounces * 2 * PHOTON_VERTEX_STRIDE_BYTES;
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
