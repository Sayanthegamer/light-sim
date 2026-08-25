# Implementation Plan: Physics Engine Architecture & Correctness Refactor

## Phase 1: Test Suite & Regression Baseline (Red Phase) [checkpoint: baeb3f6]

- [x] Task: Write failing unit tests for multi-spectral frustum independence (baeb3f6)
  - [x] Test that tracing multiple spectral samples preserves distinct frustums without mutating earlier samples
  - [x] Test that pool exhaustion degrades gracefully without returning aliased references
- [x] Task: Write failing unit tests for black hole geodesic unification and optical ray continuation (baeb3f6)
  - [x] Test that `traceGeodesicWithTermination` handles capture, escape, winding, and step budget
  - [x] Test that escaped black hole rays continue downstream to refract through prisms/lenses
- [x] Task: Write failing stress tests for deep optical branching scenes (>32 branches) (baeb3f6)
  - [x] Test `emitter → prism → mirror → lens → prism` optical chain
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (baeb3f6)

## Phase 2: Frustum Pool Refactoring & Branch Budget Scaling (Green Phase) [checkpoint: fbadb3c]

- [x] Task: Refactor `BranchManager` memory management (fbadb3c)
  - [x] Expand `MAX_FRUSTUM_POOL` to 1024 and provide `resetPool()` method called once per frame solve
  - [x] Eliminate reference aliasing when pool limit is reached by culling/dropping rather than returning duplicate mutable slots
  - [x] Update `BeamFrustum` clone/copy utilities to guarantee immutability across spectral passes
- [x] Task: Update `OpticsEngine.solveLightField` for frame-level pool management (fbadb3c)
  - [x] Reset pool once per frame at beginning of `solveLightField()`
  - [x] Collect independent frustums across all spectral samples and emitters
- [x] Task: Verify Phase 1 tests for frustum independence and branch limits pass (fbadb3c)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (fbadb3c)

## Phase 3: Unified Geodesic Integration & Outgoing Ray Optical Splicing [checkpoint: 631576c]

- [x] Task: Upgrade RK2 step budget and trajectory capacity (631576c)
  - [x] Increase `MAX_RK2_STEPS` / trajectory buffer capacity to 256
  - [x] Ensure configurable max steps in `traceGeodesicWithTermination`
- [x] Task: Unify `OpticsEngine` black hole solving with `traceGeodesicWithTermination` (631576c)
  - [x] Remove duplicated RK2 step loops from `OpticsEngine.solveLightField()`
  - [x] Use `traceGeodesicWithTermination` for both left and right boundary rays
- [x] Task: Implement downstream optical ray splicing for escaped geodesics (631576c)
  - [x] Construct child beam frustums from escaped left/right rays ($r \ge R_{\text{influence}}$)
  - [x] Feed escaped frustums back into the optical intersection solver to hit downstream elements
- [x] Task: Verify Phase 1 black hole tests pass (631576c)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (631576c)

## Phase 4: Full System Verification, Performance & Coverage Validation [checkpoint: 1c68b5c]

- [x] Task: Comprehensive test suite execution and coverage check (1c68b5c)
  - [x] Run `CI=true npx vitest run --coverage` and verify >80% coverage on core math/physics/geometry
  - [x] Run type checking with `npm run check`
- [x] Task: Real-time performance and WebGL2 rendering verification (1c68b5c)
  - [x] Verify 60 FPS performance in complex scenes with multiple spectral emitters, lenses, prisms, and black holes
  - [x] Confirm zero GC allocations in active per-frame solve loops
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (1c68b5c)
