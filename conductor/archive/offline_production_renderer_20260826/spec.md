# Track Specification: Dedicated "Cycles-Style" Offline Production Renderer

## Overview
This track introduces a dedicated, high-fidelity offline production rendering engine (**"Render Mode"**) running in background Web Worker threads. It upgrades the engine from real-time polygonal beam approximations to an unbounded, physically rigorous **Monte Carlo Bidirectional Photon & Wavefront Integrator** targeting a 32-bit floating point accumulation buffer (`RGBA32F`), complete with continuous spectral sampling, Sellmeier glass dispersion, Huygens-Fresnel wave interference, volumetric Rayleigh/Mie scattering, adaptive RK45 curved geodesics, and HDR/PNG export capabilities.

---

## Functional Requirements

### 1. Continuous Spectral Monte Carlo Transport (`spectralSampler.ts`)
- Sample continuous wavelengths $\lambda \sim U(380, 780)\text{ nm}$ per photon path weighted by emitter Spectral Power Distribution (Planck Blackbody radiation curves $B(\lambda, T)$ or standard D65 daylight).
- Evaluate exact 3-term Sellmeier dispersion equations for glass materials:
  $$n^2(\lambda) = 1 + \sum_{i=1}^3 \frac{B_i \lambda^2}{\lambda^2 - C_i}$$
  across catalog glasses (BK7, Fused Silica, Flint, Sapphire, Diamond).
- Integrate direct spectral radiant flux into standard CIE 1931 XYZ tristimulus values ($\bar{x}(\lambda), \bar{y}(\lambda), \bar{z}(\lambda)$) before linear sRGB conversion:
  $$X = \int S(\lambda) \bar{x}(\lambda) d\lambda, \quad Y = \int S(\lambda) \bar{y}(\lambda) d\lambda, \quad Z = \int S(\lambda) \bar{z}(\lambda) d\lambda$$

### 2. Wave-Phase Superposition & Slit Diffraction (`waveOptics.ts`)
- Track complex wave phase $\phi_k = \vec{k}\cdot\vec{r} - \omega t$ along photon paths.
- Treat aperture slits and knife edges as arrays of secondary Huygens-Fresnel wavelets emitting complex electric field vectors $\tilde{E} = E_0 e^{i\phi}$.
- Coherently accumulate field amplitudes to resolve physical interference fringes, Airy discs, and diffraction patterns on sensor surfaces:
  $$\tilde{E}_{\text{total}} = \sum_k A_k e^{i \phi_k}, \quad I \propto |\tilde{E}_{\text{total}}|^2$$

### 3. Volumetric Monte Carlo Media (`volumetricMedium.ts`)
- Sample photon free-flight distances in scattering media via exponential distribution:
  $$s = -\frac{\ln(1 - \xi)}{\sigma_t}$$
- Evaluate exact Rayleigh phase functions for molecular gas scattering:
  $$p_R(\theta) = \frac{3}{16\pi}(1 + \cos^2\theta)$$
- Evaluate Henyey-Greenstein / Mie phase functions for forward/backward particulate haze:
  $$p_M(\theta) = \frac{1}{4\pi}\frac{1 - g^2}{(1 + g^2 - 2g\cos\theta)^{3/2}}$$

### 4. Uncapped Stochastic Russian Roulette Bouncing
- Remove hard 8-bounce and $I < 0.005$ energy cutoffs for offline rendering.
- Terminate paths stochastically using Fresnel reflection/transmission continuation probability $P = \min(1.0, \max(R, T))$ with weight boosting ($W \leftarrow W / P$) to preserve unbiased energy conservation.

### 5. Adaptive RK45 Geodesic Integrator (`geodesicIntegrator.ts`)
- Replace fixed RK2 with an adaptive 4th/5th-order Runge-Kutta-Fehlberg (RK45) or 4th-order Symplectic integrator.
- Dynamically adjust step sizes near the Schwarzschild photon sphere ($r = 1.5 r_s$) to accurately capture chaotic orbital winding and gravitational lensing without horizon tunneling.

### 6. Worker Dispatcher & Progressive 32-bit Accumulator (`renderWorker.ts`, `accumulationTarget.ts`)
- Background Web Worker(s) executing the Monte Carlo kernel off the main thread.
- Manage high-precision `RGBA32F` tile buffer and per-pixel sample-count map.
- Stream progressive frame updates (50k–200k samples/sec) back to the UI thread via transferable ArrayBuffers.

### 7. Production Render Modal & Export Dock (`RenderModal.svelte`, `hdrExporter.ts`)
- Modal dialog featuring live progressive render preview canvas, pause/resume, cancel, and progress statistics (pass count, total photons, samples/sec, elapsed time).
- Interactive exposure, gamma, and tonemapping sliders.
- 32-bit Radiance `.hdr` export and 16-bit / 8-bit crisp `.png` snapshot download buttons.
- "Render" launch action integrated into the main Dock UI.

---

## Non-Functional & Performance Requirements
- **Non-Blocking UI:** Main thread stays locked at 60 FPS while the worker performs full-load Monte Carlo simulation in the background.
- **Precision & Dynamic Range:** True 32-bit floating-point accumulation preventing energy clipping or banding in intense caustic focus points.
- **Clean Architecture & Zero-GC Transport:** Worker transport loop uses preallocated photon scratch structures to prevent GC pauses during long multi-million sample renders.
- **Comprehensive Unit Testing:** >80% test coverage for Planck SPD sampling, Sellmeier equations, Rayleigh/Mie phase evaluations, RK45 geodesics, and HDR binary serialization.

---

## Acceptance Criteria
- [ ] Offline renderer runs entirely in dedicated Web Worker(s) with transferable memory buffers.
- [ ] Continuous spectral ray tracing evaluates accurate dispersion curves for standard optical glasses.
- [ ] Volumetric medium correctly scatters photons with Rayleigh and Henyey-Greenstein angular distributions.
- [ ] Slit apertures exhibit Huygens-Fresnel wave interference fringes.
- [ ] Extreme spacetime curvature near Schwarzschild black holes resolves stably via adaptive RK45 geodesics.
- [ ] 32-bit float accumulation target accurately accumulates HDR samples without clamping.
- [ ] RenderModal provides real-time progressive preview, statistics, exposure adjustments, and HDR/PNG export buttons.
- [ ] All unit and integration tests pass with >80% coverage on new modules.

---

## Out of Scope
- Distributed cloud/network rendering across multiple remote machines (kept client-side inside browser Web Workers).
- Real-time 60 FPS interactive path tracing (that remains the domain of the 4-pass WebGL2 polygon frustum pipeline).
