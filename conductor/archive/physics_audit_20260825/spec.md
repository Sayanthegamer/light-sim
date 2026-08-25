# Specification: Comprehensive Physics Audit & Refactor

## Overview
A comprehensive bug fix and refactor track to address severe physical implementation deviations identified during the source-level audit. The focus is on integrating the black hole system with the optical tree, fixing lens and prism physics, connecting corner snapping, and correcting temporal accumulation to achieve a high-fidelity optics and GR simulator.

## Functional Requirements
1. **Black Hole Integration**: Integrate Black Hole rendering into the main optical ray tree (handling rays after reflections/refractions and secondary branches).
2. **Redshift Wiring**: Properly wire gravitational redshift and wavelength shift into the scene rendering path.
3. **Cauchy Dispersion**: Correct default presets (e.g., N-BK7) to exhibit physically meaningful angular dispersion.
4. **Concave Lenses**: Implement authentic geometry branches for biconcave and planoconcave lenses.
5. **Corner Snapping & Intersections**: Wire the existing 5-step bisection engine into the `BranchManager`'s runtime trace and resolve partial-beam frustum intersections.
6. **Temporal Accumulation**: Fix the render pipeline so the 8-frame progressive EMA accumulation correctly drives the composite screen output.
7. **Schwarzschild Integration**: Adjust the gravity equation for a more accurate spatial geodesic integration.
8. **Pipeline & Geometry Fixes**: Address HDR RGBM fallback, texture filtering fallbacks, white-light intensity scaling (`1/N`), zero-length/radius geometry guards, and object ID collisions.

## Non-Functional Requirements
- **Validation-First**: Strict property-based tests verifying physical invariants (energy conservation, angular dispersion, Schwarzschild deflection) must be written *before* modifying engine logic (Test-Driven Development).
- **Performance Strategy**: Prioritize correct physical models first, followed by profiling and optimization to target 60 FPS, relying on temporal accumulation during static frames.

## Acceptance Criteria
- Test suite passes with >80% coverage on new core routines, including the new property-based physical invariant tests.
- Black holes correctly affect light from secondary bounces (e.g., rays emerging from prisms).
- Concave lenses physically diverge incoming parallel rays.
- Prisms display measurable chromatic angular dispersion with default Cauchy parameters.
- Temporal accumulation visibly refines the image after pointer release.

## Out of Scope
- CIE color conversion and basic Snell/Fresnel implementation (audited as solid).
- The 32-frustum pool and bounce depth limits (considered acceptable structural approximations for this stage).
