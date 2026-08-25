# Specification: Physics Engine Architecture & Correctness Refactor

## Overview

This track refactors and fixes critical semantic bugs in the physical optics and curved spacetime simulation pipeline. It addresses object aliasing / memory mutation in `BranchManager`'s frustum pool, eliminates artificial scene complexity branch caps, unifies curved geodesic tracing on `traceGeodesicWithTermination()`, implements optical continuation/splicing for rays escaping black holes, increases RK2 integration step budgets, and establishes comprehensive physics regression test coverage.

## Functional Requirements

### 1. Frustum Pooling & Reference Independence
- **Frame-Level Pool Lifecycle:** Redesign `BranchManager` frustum allocation such that reusable pool slots are reset once per frame solve (`solveLightField`), rather than per spectral sample.
- **Cross-Sample Preservation:** Every spectral sample ($s \in [0, \text{samples}-1]$) and emitter must produce distinct, immutable frustum entries that remain valid throughout the entire frame pass without being overwritten by subsequent samples.
- **Graceful Pool Exhaustion:** If pool capacity is reached, degrade gracefully by culling/dropping lower-energy branches rather than returning aliased mutable references to the final pool slot.
- **Increased Pool Capacity:** Expand default pool capacity from 32 to 1024 frustums.

### 2. Scene Complexity & Deep Optical Branching
- Support deep multi-element optical chains (e.g. `emitter → prism → mirror → lens → prism`) across high bounce counts ($\text{depth} \le 8$) without silent truncation or corruption.

### 3. Unified Geodesic Integration Architecture
- **Single Source of Truth:** Eliminate the duplicated ad-hoc RK2 loops in `OpticsEngine.solveLightField()`.
- **Full Condition Support:** All geodesic calculations must flow through `traceGeodesicWithTermination()`, supporting the 4 standard termination conditions:
  1. Horizon capture ($r \le r_s$)
  2. Boundary escape ($r \ge R_{\text{influence}}, \vec{v}\cdot\vec{r} > 0$)
  3. Angular winding limit ($|\Delta\theta| \ge 2\pi$)
  4. Configurable step budget cap ($N_{\text{max}} = 256$, up from 64)
- **High-Capacity Trajectory Buffers:** Increase `MAX_RK2_STEPS` and trajectory buffer capacity to 256 to ensure smooth orbits near the photon sphere ($r \approx 1.5 r_s$) under adaptive $dt$.

### 4. Escaped Geodesic Optical Continuation & Splicing
- When rays of a beam frustum escape a black hole influence region ($r \ge R_{\text{influence}}$), compute exit rays with their exit position and velocity vector.
- Splice escaped rays back into the optical tracing pipeline as downstream beam frustums so that curved light can hit mirrors, lenses, prisms, and barriers downstream.
- Handle partial capture / ribbon pinch gracefully when one boundary ray is captured and one escapes.

### 5. Rigorous Physics Regression Test Suite
- Comprehensive Vitest unit test suite covering:
  - Multi-spectral frustum independence (ensuring earlier spectral samples are preserved).
  - Deep optical branching (>32 active frustums) without data corruption.
  - 4-condition geodesic termination verification.
  - Black hole ray continuation through downstream prisms and lenses.
  - Energy conservation across dielectric splits and reflections.

## Non-Functional Requirements
- Maintain smooth 60 FPS real-time simulation on budget integrated GPUs.
- Zero heap garbage collection allocations in per-frame ray solving loops via pre-allocated typed arrays and frame pools.
- TypeScript strict compile-time type safety and JSDoc annotations.

## Acceptance Criteria
- Multi-sample spectral emitter produces distinct, unmutated frustums for every wavelength channel.
- Deep optical scene `emitter → prism → mirror → lens → prism` traces all branches cleanly up to configured bounce depth.
- Black hole trajectories escaping influence zone continue straight into downstream prisms/lenses and refract realistically.
- All unit tests pass with `CI=true npx vitest run`.

## Out of Scope
- Kerr (rotating) spacetime frame dragging.
- 3D volumetric raymarching.
