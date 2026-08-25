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

## Phase 3: Unified Geodesic Integration & Outgoing Ray Optical Splicing

- [ ] Task: Upgrade RK2 step budget and trajectory capacity
  - [ ] Increase `MAX_RK2_STEPS` / trajectory buffer capacity to 256
  - [ ] Ensure configurable max steps in `traceGeodesicWithTermination`
- [ ] Task: Unify `OpticsEngine` black hole solving with `traceGeodesicWithTermination`
  - [ ] Remove duplicated RK2 step loops from `OpticsEngine.solveLightField()`
  - [ ] Use `traceGeodesicWithTermination` for both left and right boundary rays
- [ ] Task: Implement downstream optical ray splicing for escaped geodesics
  - [ ] Construct child beam frustums from escaped left/right rays ($r \ge R_{\text{influence}}$)
  - [ ] Feed escaped frustums back into the optical intersection solver to hit downstream elements
- [ ] Task: Verify Phase 1 black hole tests pass
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Full System Verification, Performance & Coverage Validation

- [ ] Task: Comprehensive test suite execution and coverage check
  - [ ] Run `CI=true npx vitest run --coverage` and verify >80% coverage on core math/physics/geometry
  - [ ] Run type checking with `npm run check`
- [ ] Task: Real-time performance and WebGL2 rendering verification
  - [ ] Verify 60 FPS performance in complex scenes with multiple spectral emitters, lenses, prisms, and black holes
  - [ ] Confirm zero GC allocations in active per-frame solve loops
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
