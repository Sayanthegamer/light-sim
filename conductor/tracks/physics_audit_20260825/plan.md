# Implementation Plan: Comprehensive Physics Audit & Refactor

## Phase 1: Test Suite Enhancement (Physical Invariants) [checkpoint: 26db1d2]
- [x] Task: Scaffold Physical Property Tests bf42761
    - [x] Create test files for Black Hole Schwarzschild deflection invariants.
    - [x] Create test files for Cauchy angular dispersion invariants.
    - [x] Create test files for Concave Lens geometry bounds.
    - [x] Create test files for Energy scaling ($1/N$).
- [x] Task: Implement Failing Tests bf42761
    - [x] Write failing test for true biconcave geometry divergence.
    - [x] Write failing test for Cauchy angular spread magnitude.
    - [x] Write failing tests for secondary branch black hole integration.
    - [x] Write failing tests for bisection intersection splitting.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) 1b252a5

## Phase 2: Optics Core & Geometry Fixes
- [ ] Task: Correct Cauchy Dispersion Presets
    - [ ] Update `A` and `B` presets for Crown/Flint glasses.
    - [ ] Validate tests pass.
- [ ] Task: Fix Lens Implementations
    - [ ] Add `Biconcave` and `Planoconcave` geometry logic in `LensNode`.
    - [ ] Update collision algorithms for concave boundaries.
    - [ ] Validate tests pass.
- [ ] Task: Corner Bisection & Intersection Overhaul
    - [ ] Wire bisection engine into `BranchManager.traceLightTree`.
    - [ ] Implement partial frustum splitting logic for edge discontinuities.
    - [ ] Add guards for zero-length segments and zero-radius arcs.
    - [ ] Validate tests pass.
- [ ] Task: Resolve Minor Physics Scaling Issues
    - [ ] Update white-light intensity scaling to follow `1/N`.
    - [ ] Fix object ID generation to prevent collisions.
    - [ ] Validate tests pass.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Spacetime & Black Hole Engine
- [ ] Task: Ray Tree Integration
    - [ ] Restructure `OpticsEngine.solveLightField` to pass all branches (prisms, lenses, TIR) into the Black Hole RK2 integrator.
- [ ] Task: Schwarzschild Adjustments & Redshift
    - [ ] Adjust RK2 spatial geodesic equation to properly reflect weak-field deflection.
    - [ ] Pass `blackHole` and `baseLambda` to `generateRibbonMesh` to wire redshift into the pipeline.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Render Pipeline & Post-Processing
- [ ] Task: Temporal Accumulation Fix
    - [ ] Connect the output of the 8-frame EMA accumulator to the final screen composite.
- [ ] Task: HDR & Fallback Improvements
    - [ ] Implement true RGBM encoding/decoding in `RGBA8` fallback.
    - [ ] Handle missing `OES_texture_half_float_linear` properly by falling back to `NEAREST` filtering.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
