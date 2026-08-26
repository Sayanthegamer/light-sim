# Implementation Plan: Full GPU Acceleration & Independent Multi-Device Rendering

## Overview
Implement a high-throughput WebGPU Compute-to-Raster photon transport acceleration pipeline with hardware clip-culling, distinct multi-SSBO bindings, and an 8-element short-stack BVH, integrated into a unified multi-device architecture alongside the multi-threaded CPU worker pool.

---

## Phase 1: WebGPU Foundation, Multi-SSBO Layouts & Minimal Kernel Prototype

- [x] Task: Implement WebGPU device initialization (`navigator.gpu`), feature detection, and context fallback handling [ae550c2]
    - [x] Create `src/engine/offline/gpu/webgpuContext.ts` with device request, loss handlers, and capability checks
    - [x] Write unit tests for WebGPU capability detection and mock fallback initialization
- [x] Task: Implement TypeScript encoders for `BVHNode`, `SegmentPrimitive`, `ArcPrimitive`, and `BlackHolePrimitive` with byte-exact stride tests [b87729c]
    - [x] Create `src/engine/offline/gpu/gpuPrimitiveLayout.ts` defining binary structures and typed array packing
    - [x] Write unit tests verifying byte offsets, struct sizes, and field alignments against WGSL specs
- [x] Task: Implement 8-element short-stack 2D BVH builder on CPU for scene geometry [c50fc5f]
    - [x] Create `src/engine/offline/gpu/gpuBvhBuilder.ts` to construct balanced bounding hierarchies from scene snapshots
    - [x] Write unit tests verifying AABB containment, leaf indexing, and max depth bounds
- [ ] Task: Build minimal WGSL Compute & Hardware Clip-Culling prototype with adaptive micro-batch pacing
    - [ ] Create `src/engine/offline/gpu/shaders/photonTransport.wgsl` and `clipRaster.wgsl`
    - [ ] Write test harness verifying pipeline creation, bind group creation, and dispatch execution
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

---

## Phase 2: Complete Physical Optics WGSL Kernel & Floating-Point Accumulation Pipeline

- [ ] Task: Implement full physical optics in WGSL
    - [ ] Implement continuous CIE 1931 color matching and Cauchy dispersion solver in WGSL
    - [ ] Implement Snell refraction, Fresnel reflection, and Russian Roulette stochastic branching in WGSL
    - [ ] Implement Schwarzschild geodesic stepping inside black hole influence zones in WGSL
    - [ ] Write unit tests verifying mathematical consistency of WGSL shader generators
- [ ] Task: Implement WebGPU Render Pipeline with hardware clip-culling and native floating-point additive blending
    - [ ] Create render pipeline with `rgba32float` / `rgba16float` target format and `blendFunc(ONE, ONE)`
    - [ ] Configure vertex shader to discard dead/absorbed segments via out-of-clip coordinates ($w = 0$)
- [ ] Task: Implement progressive accumulation ping-pong and direct float readback into `AccumulationTarget`
    - [ ] Create `src/engine/offline/gpu/gpuAccumulator.ts` managing textures and staging readback buffers
    - [ ] Implement direct `Float32Array` readback bridging GPU accumulation to `AccumulationTarget`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

---

## Phase 3: Concrete WebGpuComputeDispatcher & Resilient Lifecycle

- [ ] Task: Implement `WebGpuComputeDispatcher` with concrete progress reporting, adaptive micro-batch pacing, and cancellation/pause lifecycle
    - [ ] Create `src/engine/offline/gpu/webgpuComputeDispatcher.ts` implementing `start`, `pause`, `resume`, `cancel`
    - [ ] Implement live throughput calculation (MPhotons/sec, pass count, elapsed time)
- [ ] Task: Implement robust error recovery for WebGPU device loss, out-of-memory, and shader compilation failures
    - [ ] Handle asynchronous device loss events and clean buffer teardown
    - [ ] Implement fallback notification triggering CPU worker fallback if GPU execution fails
- [ ] Task: Write unit tests covering dispatcher state machines, buffer cleanup, and progress aggregation
    - [ ] Test lifecycle states (`IDLE`, `RUNNING`, `PAUSED`, `COMPLETE`, `CANCELLED`)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

---

## Phase 4: Multi-Device Abstraction & Unified Dispatcher Integration

- [ ] Task: Extract common `IDeviceDispatcher` interface from the two concrete dispatchers (`CpuWorkerDispatcher` and `WebGpuComputeDispatcher`)
    - [ ] Create `src/engine/offline/deviceDispatcher.ts` defining `IDeviceDispatcher`, `ProgressCallback`, and `CompleteCallback`
    - [ ] Refactor `src/engine/offline/cpuWorkerDispatcher.ts` to implement `IDeviceDispatcher`
- [ ] Task: Refactor `RenderDispatcher` to act as the unified multi-device manager with device selection and clean fallback logic
    - [ ] Update `src/engine/offline/renderDispatcher.ts` to manage active backend (`gpu` | `cpu` | `auto`)
    - [ ] Implement automatic device selection based on WebGPU availability
- [ ] Task: Write integration tests verifying seamless switching and independent execution across both backends
    - [ ] Verify both dispatchers run independently without state bleeding
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
