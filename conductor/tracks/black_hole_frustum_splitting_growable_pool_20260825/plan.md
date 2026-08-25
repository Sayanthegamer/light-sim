# Implementation Plan: Black Hole Frustum Intersection, Splitting & Growable Pool Refactor

## Phase 1: Test Suite & Regression Baseline (Red Phase) [checkpoint: f4c4677]
- [x] Task: Create regression test suite for asymmetric entry, partial grazing, and pool expansion (f4c4677)
  - [x] Write test for right-ray-first black hole entry deflection
  - [x] Write test for left-ray-only partial grazing with explicit frustum partition correctness
  - [x] Write test for right-ray-only partial grazing with explicit frustum partition correctness
  - [x] Write test for auto-expanding frustum pool beyond 1024 without branch dropping
- [x] Task: Verify Phase 1 tests fail on baseline (Red Phase) (f4c4677)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (f4c4677)

## Phase 2: Auto-Expanding Frustum Pool & Memory Architecture [checkpoint: 63f5dc2]
- [x] Task: Refactor `BranchManager.allocateFrustum()` to dynamically expand pool (63f5dc2)
  - [x] Remove hard `null` returns when `poolCount >= frustumPool.length`
  - [x] Push newly allocated `BeamFrustum` objects to dynamically grow the pool on demand
  - [x] Ensure frame-level `resetPool()` preserves expanded capacity across frames
- [x] Task: Verify Phase 1 pool expansion test passes (63f5dc2)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (63f5dc2)

## Phase 3: Symmetric Black Hole Entry, Partial Grazing & Frustum Partitioning
- [ ] Task: Implement symmetric and order-agnostic black hole entry detection
  - [ ] Remove asymmetric left-first ordering check (`tEntryL < tEntryR`)
  - [ ] Determine closest black hole using `min(tEntryL, tEntryR)`
  - [ ] Clamp endpoints $(x_L, y_L)$ and $(x_R, y_R)$ to their respective entry points
- [ ] Task: Implement partial beam grazing and frustum partitioning
  - [ ] Detect single-edge boundary entry (`hasLeftEntry !== hasRightEntry`)
  - [ ] Form geodesic ribbon for the entering energy fraction
  - [ ] Partition unaffected outer beam portion into continuing Euclidean sub-frustum
  - [ ] Verify explicit frustum partition correctness test passes
- [ ] Task: Verify all Phase 1 regression tests pass
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Full System Verification, Performance & Coverage Validation
- [ ] Task: Comprehensive test suite execution and coverage check
  - [ ] Run `npx vitest run` across all test files
  - [ ] Run type checking with `npm run check`
  - [ ] Run production build with `npm run build`
- [ ] Task: Real-time performance and rendering verification
  - [ ] Verify 60 FPS performance in grazing black hole scenes
  - [ ] Confirm amortized zero-GC memory allocation during continuous rendering
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
