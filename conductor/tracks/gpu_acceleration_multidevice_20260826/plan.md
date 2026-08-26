# Implementation Plan: Full GPU Acceleration & Independent Multi-Device Rendering

## Overview
Implement a high-throughput WebGPU Compute-to-Raster photon transport acceleration pipeline with hardware clip-culling, distinct multi-SSBO bindings, and an 8-element short-stack BVH, integrated into a unified multi-device architecture alongside the multi-threaded CPU worker pool.

---

## Phase 1: WebGPU Foundation, Multi-SSBO Layouts & Minimal Kernel Prototype [checkpoint: a9458da]

- [x] Task: Implement WebGPU device initialization (`navigator.gpu`), feature detection, and context fallback handling [ae550c2]
    - [x] Create `src/engine/offline/gpu/webgpuContext.ts` with device request, loss handlers, and capability checks
    - [x] Write unit tests for WebGPU capability detection and mock fallback initialization
- [x] Task: Implement TypeScript encoders for `BVHNode`, `SegmentPrimitive`, `ArcPrimitive`, and `BlackHolePrimitive` with byte-exact stride tests [b87729c]
    - [x] Create `src/engine/offline/gpu/gpuPrimitiveLayout.ts` defining binary structures and typed array packing
    - [x] Write unit tests verifying byte offsets, struct sizes, and field alignments against WGSL specs
- [x] Task: Implement 8-element short-stack 2D BVH builder on CPU for scene geometry [c50fc5f]
    - [x] Create `src/engine/offline/gpu/gpuBvhBuilder.ts` to construct balanced bounding hierarchies from scene snapshots
    - [x] Write unit tests verifying AABB containment, leaf indexing, and max depth bounds
- [x] Task: Build minimal WGSL Compute & Hardware Clip-Culling prototype with adaptive micro-batch pacing [61b4cd8]
    - [x] Create `src/engine/offline/gpu/shaders/photonTransport.wgsl` and `clipRaster.wgsl`
    - [x] Write test harness verifying pipeline creation, bind group creation, and dispatch execution
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [a9458da]

---

## Phase 2: Complete Physical Optics WGSL Kernel & Floating-Point Accumulation Pipeline [checkpoint: 87dc821]

- [x] Task: Implement full physical optics in WGSL [9d6807c]
    - [x] Implement continuous CIE 1931 color matching and Cauchy dispersion solver in WGSL
    - [x] Implement Snell refraction, Fresnel reflection, and Russian Roulette stochastic branching in WGSL
    - [x] Implement Schwarzschild geodesic stepping inside black hole influence zones in WGSL
    - [x] Write unit tests verifying mathematical consistency of WGSL shader generators
- [x] Task: Implement WebGPU Render Pipeline with hardware clip-culling and native floating-point additive blending [f33f403]
    - [x] Create render pipeline with `rgba32float` / `rgba16float` target format and `blendFunc(ONE, ONE)`
    - [x] Configure vertex shader to discard dead/absorbed segments via out-of-clip coordinates ($w = 0$)
- [x] Task: Implement progressive accumulation ping-pong and direct float readback into `AccumulationTarget` [f33f403]
    - [x] Create `src/engine/offline/gpu/gpuAccumulator.ts` managing textures and staging readback buffers
    - [x] Implement direct `Float32Array` readback bridging GPU accumulation to `AccumulationTarget`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [87dc821]

---

## Phase 3: Concrete WebGpuComputeDispatcher & Resilient Lifecycle [checkpoint: e15bc9e]

- [x] Task: Implement `WebGpuComputeDispatcher` with concrete progress reporting, adaptive micro-batch pacing, and cancellation/pause lifecycle [d1177cd]
    - [x] Create `src/engine/offline/gpu/webgpuComputeDispatcher.ts` implementing `start`, `pause`, `resume`, `cancel`
    - [x] Implement live throughput calculation (MPhotons/sec, pass count, elapsed time)
- [x] Task: Implement robust error recovery for WebGPU device loss, out-of-memory, and shader compilation failures [d1177cd]
    - [x] Handle asynchronous device loss events and clean buffer teardown
    - [x] Implement fallback notification triggering CPU worker fallback if GPU execution fails
- [x] Task: Write unit tests covering dispatcher state machines, buffer cleanup, and progress aggregation [d1177cd]
    - [x] Test lifecycle states (IDLE, RUNNING, PAUSED, COMPLETE, CANCELLED)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [e15bc9e]

---

## Phase 4: Multi-Device Abstraction & Unified Dispatcher Integration

- [x] Task: Refactor and extract `IDeviceDispatcher` interface common to CPU and GPU dispatchers (`CpuWorkerDispatcher` and `WebGpuComputeDispatcher`) [edeb5fd]
    - [x] Create `src/engine/offline/deviceDispatcher.ts` defining `IDeviceDispatcher`, `ProgressCallback`, and `CompleteCallback`
    - [x] Refactor `src/engine/offline/cpuWorkerDispatcher.ts` to implement `IDeviceDispatcher`
- [x] Task: Refactor `RenderDispatcher` to act as the unified multi-device manager with device selection and clean fallback logic [edeb5fd]
    - [x] Implement runtime device query (`auto` -> WebGPU if available, fallback to CPU worker pool)
    - [x] Ensure seamless failover to CPU workers if WebGPU throws initialization or device loss errors
- [x] Task: Write unit tests verifying multi-device orchestration, device switching, and error fallback [edeb5fd]
    - [x] Test device selection flags (`cpu`, `gpu`, `auto`)
    - [x] Test automatic fallback triggers when GPU mock rejects
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

---

## Phase 5: UI Controls, Live Telemetry & End-to-End Verification

- [ ] Task: Update `RenderModal.svelte` with Device Selector (`GPU / CPU`), dynamic batch size slider, hardware badge, and live MPhotons/sec counter
    - [ ] Add Device Selector dropdown and hardware capability indicator
    - [ ] Connect dynamic GPU batch size slider and CPU thread count selector
    - [ ] Display live MPhotons/sec and device badge in the telemetry bar
- [ ] Task: Verify 32-bit Radiance `.hdr` and `.png` export parity across both CPU and GPU backends
    - [ ] Test `.hdr` and `.png` exports across preset scenes (Newton Prism, Achromatic Doublet, TIR Retroreflector)
- [ ] Task: Run full test suite (`CI=true npx vitest run`) and ensure clean build and type check
    - [ ] Verify zero TypeScript errors (`npx tsc --noEmit`) and all tests passing
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
