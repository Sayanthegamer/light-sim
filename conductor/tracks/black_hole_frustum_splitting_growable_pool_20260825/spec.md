# Specification: Black Hole Frustum Intersection, Splitting & Growable Pool Refactor

## 1. Overview
This track addresses three critical architectural and optical accuracy issues in the physics engine:
1. **Symmetric & Order-Agnostic Entry:** Fixing asymmetric left-ray-first bias so black hole interactions execute reliably regardless of whether the left or right ray enters first.
2. **Partial Black Hole Grazing & Frustum Partitioning:** Partitioning finite-width beam frustums when only one boundary enters the influence zone, ensuring the affected light undergoes geodesic integration while the unaffected outer portion continues through Euclidean space.
3. **Auto-Expanding Zero-GC Frustum Pool:** Converting the fixed 1024-frustum pool ceiling into a dynamically expanding pre-allocated pool that grows on demand without dropping branches in dense multi-spectral scenes.

## 2. Functional Requirements

### 2.1 Symmetric & Order-Agnostic Entry
- Black hole entry detection must not assume $t_{\text{entry}, L} < t_{\text{entry}, R}$.
- Evaluate the earliest valid entry distance across both rays:
  $$\text{minEntryDist} = \min(t_{\text{entry}, L}, t_{\text{entry}, R})$$
- For a beam where both rays enter the influence boundary ($R_{\text{influence}} = 12 r_s$):
  - Left straight ray is clamped to $(x_L, y_L) \leftarrow \text{entryPoint}_L$.
  - Right straight ray is clamped to $(x_R, y_R) \leftarrow \text{entryPoint}_R$.
  - Geodesic trajectories are integrated from their respective entry points via `traceGeodesicWithTermination()`.

### 2.2 Partial Beam Grazing & Frustum Partitioning
- When only ONE boundary ray enters the black hole influence sphere (e.g. Left ray enters at $t_L$, Right ray misses):
  - The entering ray is clamped to its entry point $t_L$ and integrated along its geodesic trajectory.
  - An internal tangent boundary is computed where the beam intersects or grazes the influence boundary circle.
  - The entering energy fraction forms a geodesic ribbon mesh between the entering ray and the tangent/chord trajectory.
  - The unaffected energy fraction partitions into a continuous straight Euclidean sub-frustum that continues propagating downstream to hit scene obstacles.

### 2.3 Auto-Expanding Zero-GC Frustum Pool
- In `BranchManager.allocateFrustum()`:
  - If `poolCount >= frustumPool.length`, push a newly allocated `createBeamFrustum()` onto the pool array.
  - Return `this.frustumPool[this.poolCount++]`.
  - Maintain frame-level `resetPool()` so memory remains allocated and reusable across successive frames.

## 3. Acceptance Criteria
- Unit tests verify right-ray-first entry is deflected without being skipped.
- Unit tests verify single-edge partial grazing generates geodesic curvature while the unaffected sub-frustum continues downstream without loss.
- Unit tests verify explicit frustum partition correctness (energy conservation and spatial alignment).
- Unit tests verify pool dynamically expands beyond 1024 without dropping branches in deep scenes.
- 100% of unit tests pass, `npm run check` passes with 0 errors, and `npm run build` succeeds.
