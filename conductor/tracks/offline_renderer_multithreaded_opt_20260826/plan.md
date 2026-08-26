# Implementation Plan: Offline Renderer Multi-Threaded Worker Pool & Zero-Allocation Path Tracer

## Phase 1: Zero-Allocation Scene Primitive Hoisting & Transport Kernel Refactor [checkpoint: a4a69c8]
- [x] Task: Write failing unit tests for one-time primitive precomputation and zero-allocation photon tracing a4a69c8
- [x] Task: Refactor `tracePhotonPath` signature to accept pre-extracted `Segment2D[]` and `Arc2D[]` primitives a4a69c8
- [x] Task: Hoist `extractScenePrimitives()` in `renderWorker.ts` on job start and cache Sellmeier/Cauchy indices a4a69c8
- [x] Task: Update existing offline test suite to use pre-extracted primitives a4a69c8
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) a4a69c8

## Phase 2: Multi-Threaded Worker Pool Architecture (`RenderDispatcher`) [checkpoint: c6845d0]
- [x] Task: Write failing unit tests for multi-worker lifecycle dispatching and thread concurrency splitting c6845d0
- [x] Task: Implement multi-threaded Web Worker pool in `RenderDispatcher.ts` with `navigator.hardwareConcurrency` auto-detection c6845d0
- [x] Task: Implement thread-safe progressive buffer summation and sample aggregation in `RenderDispatcher.ts` c6845d0
- [x] Task: Ensure robust multi-worker synchronization on `PAUSE`, `RESUME`, `CANCEL`, and `COMPLETE` c6845d0
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) c6845d0

## Phase 3: UI Thread Selection, Aggregated Progress Metrics & End-to-End Verification [checkpoint: 2aa6c1e]
- [x] Task: Write unit and integration tests for thread count configuration and multi-thread progress metrics 2aa6c1e
- [x] Task: Update `RenderModal.svelte` with Thread Count selector (Auto / 2 / 4 / 8 / 16 / 32) and multi-threaded metrics 2aa6c1e
- [x] Task: Execute end-to-end multi-threaded render benchmark verifying linear multi-core speedup and HDR export parity 2aa6c1e
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) 2aa6c1e
