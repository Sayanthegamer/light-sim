# Specification: Offline Renderer Multi-Threaded Worker Pool & Zero-Allocation Path Tracer

## 1. Overview
The offline Monte Carlo path tracer currently suffers from two major performance bottlenecks:
1. **Per-Photon Collision Extraction & GC Churn**: `tracePhotonPath()` repeatedly invokes `extractScenePrimitives()` for every single photon (25M+ times per render), generating millions of short-lived objects and recalculating dispersion indices for static geometry.
2. **Single-Threaded Execution**: `renderDispatcher.ts` only initializes a single Web Worker, utilizing only a single CPU core.

This track refactors the offline rendering kernel to hoist primitive extraction into a one-time precomputation step per render job, implements zero-allocation inner photon loops, and replaces the single-worker dispatcher with a scalable multi-worker pool that harnesses full CPU hardware concurrency (`navigator.hardwareConcurrency`) with progressive buffer summation.

## 2. Functional Requirements
- **FR-1: Scene Primitive Hoisting & Zero-Allocation Transport**:
  - Hoist `extractScenePrimitives()` out of the per-photon execution path.
  - Precompute and cache resolved `Segment2D[]` and `Arc2D[]` arrays once on job start in the Web Worker.
  - Signature of `tracePhotonPath` updated to accept pre-extracted primitives (`segments: readonly Segment2D[]`, `arcs: readonly Arc2D[]`), eliminating all redundant heap allocations inside the inner photon transport loop.
- **FR-2: Multi-Threaded Web Worker Pool (`RenderDispatcher`)**:
  - `RenderDispatcher` scales worker allocation to `concurrency = config.threadCount || navigator.hardwareConcurrency || 4`.
  - Distributes the render workload (`targetSamples`, `batchPhotons`) across active workers.
  - Manages worker lifecycles (`START`, `PAUSE`, `RESUME`, `CANCEL`) across all pooled worker threads concurrently.
- **FR-3: Master Accumulation Buffer Aggregation**:
  - `RenderDispatcher` maintains a master `AccumulationTarget` along with individual worker buffer caches.
  - As workers report progressive passes via transfer/copy, `RenderDispatcher` sums worker accumulation buffers and sample counts into the master target.
  - Live preview canvas and HDR/PNG export consume the merged master accumulation target.
- **FR-4: Thread Count Configuration in Render UI**:
  - Expose a thread selection control in `RenderModal.svelte` (Auto / 2 / 4 / 8 / 16 / 32 threads) defaulting to `navigator.hardwareConcurrency`.
  - Pass `threadCount` through `IOfflineRenderConfig` to the dispatcher.

## 3. Non-Functional Requirements
- **Throughput**: Deliver 10x-50x speedup for single-thread path tracing via allocation hoisting, scaling linearly with available CPU core count.
- **Memory & Zero-GC**: Zero garbage collection spikes during continuous photon tracing batches.
- **Visual Parity**: Physical output (Sellmeier dispersion, Fresnel refraction, TIR, volumetric scattering, blackbody radiance) must be pixel-exact and mathematically identical to the single-thread baseline.

## 4. Acceptance Criteria
- [ ] `tracePhotonPath()` performs zero scene primitive extractions or geometry allocations during photon tracing.
- [ ] Multi-threaded dispatcher spawns $N$ workers and distributes render batches across all available hardware threads.
- [ ] Master accumulation target accurately merges all worker buffers with correct sample counts, HDR exposure, and D65/Planck spectral weighting.
- [ ] `RenderModal` displays aggregated progress (total photons, samples/sec, elapsed time) summing all worker threads in real time.
- [ ] All automated unit and integration tests pass with 100% success.

## 5. Out of Scope
- GPU compute / WebGPU compute shader implementation (CPU Monte Carlo worker pool is the designated offline HDR export engine).
- Spatial BVH acceleration trees (reserved for future track when polygon counts exceed thousands of vertices).
