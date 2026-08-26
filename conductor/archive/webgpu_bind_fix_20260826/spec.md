# Specification: WebGPU Bind Group Validation Fix & Black Hole Wiring

## Overview
The WebGPU rendering pipeline currently throws a continuous bind group validation error: `In entries[3], binding index 3 not present in the bind group layout`. This is caused by WGPU's `layout: 'auto'` stripping `binding(3)` (`blackHoles`) because it is declared in the compute shader (`webgpuPipeline.ts`) but never statically referenced in the `main()` entry point's reachable code. This track will resolve the error by properly wiring up the existing black hole gravitational lensing logic into the main bounce loop.

## Functional Requirements
- **Shader Wiring:** The `main()` compute shader entry point MUST call `evaluateBlackHoleInteraction` for each black hole in the scene.
- **Iteration:** The shader MUST loop over the total number of black holes (accessible via `config.counts.w`).
- **Data Consumption:** The shader MUST successfully consume the `blackHoles` storage buffer at `binding(3)`.

## Non-Functional Requirements
- **Performance:** The black hole intersection loop must not cause significant performance degradation on the GPU path when no black holes are present.
- **Stability:** The solution must eliminate the bind group layout mismatch between the JS host code and the WGSL shader.

## Acceptance Criteria
- [ ] WebGPU rendering executes without bind group validation errors.
- [ ] The `blackHoles` buffer is successfully bound and referenced in the WGSL shader.
- [ ] Black hole gravitational lensing correctly affects light paths.
- [ ] The engine correctly handles multiple black holes in the scene simultaneously.

## Out of Scope
- Rewriting the physics logic inside `evaluateBlackHoleInteraction`.
- Adding new black hole types or features beyond what is already implemented in the physics functions.
