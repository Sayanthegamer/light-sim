# 2D Realistic Volumetric Optics & Spacetime Curvature Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Svelte 5](https://img.shields.io/badge/Svelte-5.x_(Runes)-ff3e00?logo=svelte)](https://svelte.dev/)
[![WebGL2](https://img.shields.io/badge/WebGL2-GLSL_3.00_ES-990000?logo=webgl)](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext)
[![WebGPU](https://img.shields.io/badge/WebGPU-WGSL_Compute-005A9C?logo=webgpu)](https://www.w3.org/TR/webgpu/)
[![Vitest](https://img.shields.io/badge/Vitest-242%20Passed-brightgreen?logo=vitest)](https://vitest.dev/)
[![Vercel Ready](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://vercel.com)

A high-fidelity real-time 2D physical optics and curved spacetime simulation platform with an integrated **WebGPU Compute + Multi-Threaded CPU Cycles Production Offline Renderer**.

Unlike conventional 2D raytracers that depict light as discrete 1D laser needles or 3-channel RGB lines, this engine treats light as a **continuous 2D radiant energy field**. Wavefronts expand into continuous polygonal frustums and ribbon strips in real time, and trace millions of continuous-spectrum Monte Carlo photons offline across the visible spectrum ($\lambda \in [380, 780]\text{ nm}$) via analytic CIE 1931 color-matching equations, Cauchy/Sellmeier dispersion, and Schwarzschild relativistic geodesics.

---

## 🌌 Core Physical Capabilities

### 1. Continuous Wavefront Transport & Spectral Dispersion
- **Polygonal Beam Frustums:** Real-time light is simulated as continuous 2D quads and triangle fans bounded by paired outer wavefront trajectories.
- **Analytic CIE 1931 Spectrum:** Shaders and offline kernels compute continuous wavelength-to-XYZ-to-sRGB integrals, eliminating discrete wavelength banding.
- **Snell's Law & Cauchy/Sellmeier Dispersion:** Refraction follows $n(\lambda) = A + \frac{B}{\lambda^2}$ and 3-term Sellmeier glass catalogs, splitting white light into continuous rainbow spectra on both entry and exit faces.
- **Fresnel Energy Conservation:** Energy partitions into transmitted and reflected components ($R + T = 1$), naturally attenuating secondary bounces.

### 2. Cycles Offline Production Renderer (WebGPU Compute + Multi-Threaded CPU)
- **WebGPU Compute-to-Raster Hybrid Pipeline:** Hardware-accelerated WGSL compute kernel with 8-level short-stack BVH traversal, dual-root convex/concave arc intersection, Schwarzschild geodesic integration, and hardware clip-culled additive line rasterization.
- **Epoch Consolidation & Welford Precision:** Periodic `rgba16float` to `Float64Array` host consolidation prevents half-float mantissa underflow while providing live sub-epoch preview readbacks and pass-normalized exposure.
- **Zero-Allocation Multi-Threaded CPU Fallback:** Web Worker pool scaling to hardware concurrency with precomputed D65/Planck CDF lookup tables, 0.5 nm CIE 1931 XYZ LUTs, and inlined uniform-irradiance bilinear line splatting.
- **32-Bit Radiance HDR (`.hdr`) & PNG Export:** Direct export of uncompressed Greg Ward RGBE `.hdr` high-dynamic-range images and tonemapped PNGs.

### 3. Non-Euclidean General Relativity & Curved Spacetime
- **Distance-Mapped Adaptive RK2/RK45 Geodesic Integrators:** Field marching within $R_{\text{influence}} = 12 r_s$ with adaptive time stepping $\Delta t(r)$.
- **Smooth Boundary Transition:** $C^1$-continuous smoothstep gravity acceleration fade over $[10 r_s, 12 r_s]$.
- **Contiguous Caustic Ribbons:** Double-sided additive quad strips with $\epsilon_{\text{pinch}} = 0.5\text{ px}$ focusing caustic energy spikes.
- **Gravitational Redshift & Dilation:** Schwarzschild wavelength scaling $(1+z) = (1 - r_s/r)^{-1/2}$ and photopic extinction damping $>780\text{ nm}$.

### 4. Atmospheric Post-Processing & Multi-Pass HDR Pipeline
- **Pass 1:** Forward Beam Quad Rasterization (`RGBA16F` HDR buffer, additive blending).
- **Pass 2:** Dedicated 1-byte `R8` Obstacle Geometry Mask rasterization preventing light bleeding into solid glass/prisms.
- **Pass 3:** Two-Tier Hybrid Volumetric Scatter (1/2-res 5-tap cross-bilateral blur + 2-stage Dual Kawase bloom for Rayleigh/Mie dust haze).
- **Pass 4:** Composite & Extended Reinhard Tonemap blit ($L_{\text{white}} = 4.0$, $\gamma = 2.2$).
- **Temporal Management:** 60 FPS single-pass during dragging, 8-frame progressive EMA accumulation when settling, and zero-overhead idle sleep.

---

## 🧪 5 Bundled Optical Presets

1. **Newton's Prism Dispersion:** White continuous light beam split into a continuous rainbow spectrum via Crown Glass N-BK7.
2. **Convex/Concave Lens Focus:** Laser wavefront focused to a caustic focal point through an analytic biconvex spherical lens.
3. **Schwarzschild Relativistic Deflection:** Grazing beam gravitational deflection, photon sphere capture, and gravitational redshift around a black hole.
4. **TIR Porro Prism Retroreflector:** Total internal reflection inside a 45-45-90 right angle prism returning light 180°.
5. **Achromatic Doublet:** Chromatic aberration correction pairing a Crown glass biconvex lens with a Flint glass biconcave lens.

---

## 📂 Repository Structure

- `src/engine/geometry/` — Zero-allocation 2D ray-segment/ray-arc solvers, adaptive corner bisection, frustum mesh generation, and branch management.
- `src/engine/optics/` — Analytic CIE 1931 color matching, Snell refraction, Cauchy dispersion, and Fresnel equations.
- `src/engine/physics/` — Schwarzschild RK2 geodesic integrator, boundary splicing, gravitational redshift, and caustic ribbon mesh builder.
- `src/engine/offline/` — Cycles offline Monte Carlo photon tracer, spectral CDF/XYZ LUT samplers, volumetric participating media, wave optics, HDR exporter, and `gpu/` WebGPU compute pipeline.
- `src/engine/renderer/` — Multi-pass WebGL2 real-time HDR pipeline and progressive EMA temporal accumulator.
- `src/engine/scene/` — Polymorphic scene graph nodes (`EmitterNode`, `PrismNode`, `LensNode`, `BlackHoleNode`, `BarrierNode`).
- `src/ui/` — Svelte 5 runes UI (`Dock.svelte`, `Inspector.svelte`, `GizmoOverlay.svelte`, `RenderModal.svelte`).
- `docs/architecture/` — Technical design specifications and architectural tradeoff papers.
- `tests/` — Comprehensive unit, regression, and integration test suite (242 tests across 49 test files).

---

## 🚀 Quick Start & Local Development

```bash
# Install dependencies
npm install

# Start local Vite development server
npm run dev

# Run Vitest test suite
npm test

# Build production bundle
npm run build
```

---

## 📜 License

Licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.
