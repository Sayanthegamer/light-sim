# Implementation Plan: WebGPU Bind Group Validation Fix & Black Hole Wiring

## Phase 1: Shader Integration & Validation Fix [checkpoint: 8b98124]

- [x] Task: Write Failing Tests
  - [x] Check if there's an existing WebGPU pipeline initialization test.
  - [x] If applicable, write a unit test to verify that a scene with a black hole successfully initializes the WebGPU pipeline without throwing a bind group layout error.
- [x] Task: Implement Shader Wiring
  - [x] Locate the main bounce loop in the WGSL shader code (likely in `webgpuPipeline.ts` or a corresponding `.wgsl` file).
  - [x] Add a loop over `config.counts.w` to iterate through all active black holes.
  - [x] Inside the loop, call the existing `evaluateBlackHoleInteraction` function, passing the relevant black hole data from the `blackHoles` array bound at `binding(3)`.
- [x] Task: Run Tests and Verify Coverage
  - [x] Run the test suite (`CI=true npx vitest run`) and ensure all tests pass.
  - [x] Verify that no new WebGL/WebGPU warnings or errors are generated in the console.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
