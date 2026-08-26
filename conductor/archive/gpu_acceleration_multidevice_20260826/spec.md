# Specification: Full GPU Acceleration & Independent Multi-Device Rendering

## 1. Overview & Vision
This track introduces a high-performance **WebGPU Compute-to-Raster GPU Acceleration Subsystem** alongside the existing multi-threaded CPU Web Worker pool. It enables users to render offline Monte Carlo photon/wave transport simulations using either **GPU**, **CPU**, or **Auto** backends independently, with full physical accuracy, high throughput, and seamless 32-bit Radiance `.hdr` and `.png` export.

---

## 2. Hardware Architecture & WGSL Design

### 2.1 WebGPU Compute-to-Raster Hybrid Pipeline
- **Compute Pass:** A WebGPU compute shader evaluates forward stochastic photon transport (emission, Cauchy dispersion, Snell refraction, Fresnel reflection, and Schwarzschild geodesic deflection) and writes generated path segments directly into a GPU-side vertex buffer (`GPUBuffer(VERTEX | STORAGE)`).
- **Hardware Additive Rasterization Pass:** A WebGPU render pipeline binds the vertex buffer and rasterizes line/quad primitives with native fixed-function hardware additive blending (`blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } }`) into an `RGBA32Float` (or `RGBA16Float`) accumulation texture.
- **Tonemap & Presentation Pass:** Full-screen quad blits the accumulation texture to the canvas with user-selected tonemapping (Reinhard/ACES/Linear) and exposure.

### 2.2 Fixed-Capacity Buffers with Hardware Clip-Culling
- Eliminates dynamic buffer resizing, atomic append contention, and synchronization bubbles.
- Allocates fixed-capacity micro-batches (e.g., $N = 65,536$ photon segments per batch).
- Dead/absorbed photons are output with out-of-bounds clip coordinates ($w = 0$ / out-of-clip). The GPU fixed-function hardware clipper discards them prior to rasterization and fragment shading, consuming zero fill-rate and ROP bandwidth.

### 2.3 Distinct Top-Level SSBO Storage Buffers
To ensure 100% WGSL spec compliance and avoid raw-pointer bitcasting hacks or `array<T>` packing restrictions, scene data is bound via distinct top-level storage buffers:
- `@group(0) @binding(0) var<storage, read> bvhNodes: array<BVHNode>;`
- `@group(0) @binding(1) var<storage, read> segments: array<SegmentPrimitive>;`
- `@group(0) @binding(2) var<storage, read> arcs: array<ArcPrimitive>;`
- `@group(0) @binding(3) var<storage, read> blackHoles: array<BlackHolePrimitive>;`
- `@group(0) @binding(4) var<storage, read_write> photonVertices: array<PhotonVertex>;`

### 2.4 8-Element Short-Stack 2D Spatial BVH
- A balanced 2D Bounding Volume Hierarchy built on CPU organizes all geometric primitives.
- Shader uses an 8-element private short-stack (`array<u32, 8>`) for $O(\log N)$ spatial traversal, consuming only 8 registers per thread and maximizing warp occupancy.

### 2.5 Epoch-Based GPU Sub-Accumulation with Welford Host Consolidation
- **Zero Mantissa Plateauing:** GPU VRAM accumulates micro-batches in epochs of 500 passes in native `rgba32float` / `rgba16float` targets.
- **Asynchronous Host Merge:** Host merges epoch buffers asynchronously into a 64-bit precision accumulator using Welford's running mean formula ($\bar{X}_k = \bar{X}_{k-1} + \frac{X_{\text{epoch}} - \bar{X}_{k-1}}{k}$), completely eliminating floating-point quantization walls during multi-hour renders.
- **Zero PCIe Stall:** Buffer reads occur every ~2 seconds with 0% frame stutter.

### 2.6 Sparse 1:1 Fixed-Index Continuation Array
- Chaotic strong-field geodesic states $(\mathbf{x}, \mathbf{v}, \lambda, E)$ that exhaust micro-batch budgets are saved into a dedicated slot `continuation[photonIdx]` without atomic append contention.
- Subsequent dispatches resume in-flight photons directly, guaranteeing 100% conservation of energy without atomic serialization.

---

## 3. Physical Optics & Curvature Scope

1. **Continuous Spectral Dispersion:** Full visible spectrum ($\lambda \in [380, 780]\text{ nm}$) with analytic CIE 1931 color matching equations in WGSL.
2. **Geometric Elements:** Polygonal prisms (Cauchy/Sellmeier $A, B$), curved circular lens arcs, planar mirrors, opaque absorbing barriers, and multi-spectral emitters (monochromatic, D65, blackbody, uniform).
3. **Physical Boundary Solvers:** Snell's law refraction, Cauchy dispersion index calculation, exact Fresnel reflection/transmission coefficients, and Russian Roulette stochastic branching with a bounded bounce limit ($N_{\text{max}} = 32$).
4. **Schwarzschild Spacetime Curvature:**
   - **Weak-Field ($r > 3 r_s$):** Analytic closed-form Einstein deflection ($\Delta \theta = 2 r_s / b$) in $O(1)$ constant time.
   - **Strong-Field ($r \le 3 r_s$):** Numerical RK2 geodesic stepping with dynamic sub-steps and gravitational redshift $(1+z) = (1 - r_s/r)^{-1/2}$.

---

## 4. Multi-Device Execution & Dispatcher Abstraction

1. **`IDeviceDispatcher` Contract:**
   - Universal interface for `CpuWorkerDispatcher` and `WebGpuComputeDispatcher`.
   - Unified lifecycle methods: `start(job, onProgress, onComplete)`, `pause()`, `resume()`, `cancel()`.
   - Progress callbacks: `pass`, `totalPhotons`, `samplesPerSec`, `elapsedMs`, `buffer`.
2. **`WebGpuComputeDispatcher`:**
   - Manages WebGPU device lifecycle, pipeline compilation, queue dispatching, and staging buffer readbacks.
   - Dynamic micro-batch sizing adapted to client device capabilities.
   - Resilient error handling for context loss and fallback detection.
3. **`CpuWorkerDispatcher`:**
   - Multi-threaded Web Worker pool preserved for baseline reference rendering and non-WebGPU environments.
4. **`RenderDispatcher` / `MultiDeviceDispatcher`:**
   - Top-level manager facilitating seamless backend selection (`GPU` vs `CPU` vs `Auto`).

---

## 5. UI Controls & Telemetry (`RenderModal.svelte`)

- **Device Selector Dropdown:** `[ GPU (WebGPU Accelerator) | CPU (Multi-Worker Pool) | Auto ]`.
- **Dynamic Context Controls:**
   - When GPU is selected: Batch Size / Workload Slider (`10k`, `25k`, `50k`, `100k`, `250k` photons/batch).
   - When CPU is selected: Thread Count Selector (`1T`, `2T`, `4T`, `8T`, `Auto`).
- **Telemetry Readouts:** Live MPhotons/sec, Workgroup Pass count, Hardware device badge (`WebGPU Compute` vs `CPU (N Threads)`), and asymptotic convergence detector ($\Delta \sigma^2$).
- **Unified Export:** 32-bit Radiance `.hdr` and `.png` export compatibility across all backends.

---

## 6. Acceptance Criteria

- [x] WebGPU compute-to-raster pipeline accurately simulates reflection, refraction, continuous dispersion, and black hole ray bending.
- [x] User can toggle between CPU and GPU modes independently with clean lifecycle reset.
- [x] Tightly-packed SSBO layouts comply with WGSL memory alignment with zero bitcast corruption.
- [x] 8-element short-stack BVH enables sub-linear spatial intersection testing on the GPU.
- [x] Unified 32-bit HDR and PNG export produce valid high-dynamic-range outputs on both backends.
- [x] All automated tests (`CI=true npx vitest run`) pass with >80% coverage.
