# Track Specification: Full Core Implementation: 2D Realistic Volumetric Optics Engine

## 1. Overview
This track delivers the complete end-to-end implementation of the 2D Realistic Volumetric Optics Engine spanning all five finalized architectural phases:
1. **Spectral Foundations & Physical Optics** (Analytic CIE 1931 GLSL shaders, Snell's Law, Cauchy dispersion, Fresnel energy conservation).
2. **2D Wavefront Geometry Engine** (CPU quad triangulation, 5-step corner bisection, quadratic arc solvers, branch pruning, 24-byte interleaved VBO).
3. **Curvature Engine** (Distance-mapped adaptive RK2 geodesic integrator, 4-condition priority exit, double-sided caustic ribbons, vertex-stage gravitational redshift).
4. **Atmospheric Post-Processing & HDR Pipeline** (Extension-guarded RGBA16F HDR buffer, R8 obstacle mask, 2-tier bilateral + Dual Kawase scatter, luminance-weighted Extended Reinhard tonemapping).
5. **Runtime Architecture & Interactive Scene Graph** (Polymorphic entity hierarchy, direct 2D canvas vector hit-testing, 32-slot pointer-up snapshot undo/redo, canonical JSON + lz-string URL sharing, Svelte 5 + Tailwind flat matte UI).

## 2. Functional Requirements

### Phase 1: Physical Optics & Spectral GLSL
- Continuous CIE 1931 color-matching equations in GLSL mapping $\lambda \in [380, 780]\text{ nm}$ to linear sRGB.
- Snell's Law refraction with Cauchy dispersion: $n(\lambda) = A + B/\lambda^2$.
- Fresnel reflection and transmission energy conservation: $R = \frac{1}{2}(r_s^2 + r_p^2)$, $T = 1 - R$.

### Phase 2: 2D Wavefront Geometry Engine
- Frustum mesh generation: Continuous 2D quads and fans connecting paired wavefront boundary rays.
- Analytic quadratic intersection solvers for flat line segments and circular/parabolic lens arcs.
- 5-step bisection subdivision with $\epsilon < 0.5\text{ px}$ vertex snapping for obstacle corner splitting.
- Dual-condition branch pruning: terminate if $I < 0.005$ or bounce depth $\ge 8$.
- Interleaved 24-byte VBO layout: `[Float32x2: a_Position, Float32: a_Intensity, Float32: a_DispersionU, Float32: a_EdgeV, Uint8x4: a_ParentColorRGB]` updated via `gl.bufferSubData`.

### Phase 3: Curvature & Geodesic Solvers
- Localized numerical integration within $R_{\text{influence}} = 12 r_s$ with step budget $N_{\text{max}} = 64$.
- Distance-mapped adaptive RK2 step sizing: $\Delta t(r) = \Delta t_{\text{min}} + (\Delta t_{\text{max}} - \Delta t_{\text{min}}) \cdot \text{clamp}\left(\frac{r - r_s}{11 r_s}, 0, 1\right)$.
- Smoothstep gravity acceleration fading over $[10 r_s, 12 r_s]$ for $C^1$-continuous boundary handoff.
- 4-condition priority exit: (1) Capture at $r \le r_s$, (2) Escape handoff at $r \ge 12 r_s$, (3) $2\pi$ winding cap, (4) 64-step failsafe.
- Double-sided quad ribbons with $\epsilon_{\text{pinch}} = 0.5\text{ px}$ caustic concentration.
- Vertex-stage Schwarzschild redshift: $(1+z) = (1 - r_s/r)^{-1/2}$ with smooth extinction damping $>780\text{ nm}$.

### Phase 4: HDR & Volumetric Post-Processing
- Extension-guarded half-float `RGBA16F` HDR framebuffers with packed 8-bit `RGBM` fallback.
- Dedicated 1-byte `R8` obstacle geometry mask pass.
- 2-tier hybrid scatter filter: 1/2-res 5-tap depth-masked bilateral Gaussian + 2-stage Dual Kawase downsampler/upsampler.
- Luminance-weighted Extended Reinhard tonemapper ($L_{\text{white}} = 4.0$) + sRGB gamma correction ($\gamma = 2.2$).
- 8-frame progressive EMA temporal accumulation ping-pong buffer with idle render loop sleep.

### Phase 5: Interactive Runtime & UI
- Polymorphic scene graph (`EmitterNode`, `PrismNode`, `LensNode`, `BlackHoleNode`, `BarrierNode`) caching flat boundary arrays on `TRANSFORM_DIRTY` / `PARAM_DIRTY`.
- Unified 2D canvas vector hit-testing and dragging gizmos (rotation rings, focal handles, aperture widths).
- 32-slot pointer-up circular snapshot ring buffer for instant undo/redo (`Ctrl+Z` / `Ctrl+Y`).
- Canonical JSON schema + `lz-string` URL hash state serializer.
- 5 bundled presets: Newton's Prism, Convex/Concave Focus, Schwarzschild Relativistic Deflection, TIR Retroreflector, and Achromatic Doublet Optical Bench.
- Svelte 5 (Runes) + Tailwind CSS flat matte dark UI dock and properties inspector (strictly zero `backdrop-filter: blur()`).

## 3. Non-Functional Requirements & Performance
- **Frame Rate:** Locked 60 FPS during continuous pointer dragging on integrated GPUs (Intel UHD / Iris Xe).
- **Zero GC:** Zero runtime heap object allocations inside the per-frame render loop.
- **Memory Footprint:** Fixed pre-allocated VBO ring buffers under 100 KB total JS-to-GPU bandwidth per frame.
- **Test Coverage:** >80% automated unit test coverage across all physics, geometry, and RK2 solver modules.

## 4. Acceptance Criteria
1. All 5 bundled presets load and render physically continuous radiant energy fields.
2. Lenses converge light to caustics with inverse-width intensity scaling without discrete ray needles.
3. Prisms produce unbroken CIE 1931 continuous rainbow spectrums without 3-stripe artifacts.
4. Black holes simulate gravitational deflection, photon sphere orbits, and vertex redshift without memory leaks.
5. Obstacle masks completely eliminate light bleeding into solid glass/prisms.
6. Direct canvas dragging, 32-slot snapshot undo/redo, and URL preset sharing operate smoothly.

## 5. Out of Scope
- 3D volumetric rendering.
- Wave-particle quantum interference/diffraction grids.
- Backend server database or cloud user accounts.
