# Implementation Plan: Dedicated "Cycles-Style" Offline Production Renderer

## Phase 1: Spectral & Material Physics Foundation [checkpoint: e5c7d2a]
- [x] Task: Write failing unit tests for continuous Planck spectral emission, CIE 1931 XYZ integration, and Sellmeier glass dispersion equations (`tests/offline/spectralSampler.test.ts`) [8adfdb3]
  - [x] Test Planck blackbody radiation curve sampling across temperature ranges
  - [x] Test continuous wavelength $\lambda \sim [380, 780]\text{ nm}$ mapping to CIE 1931 XYZ tristimulus integrals
  - [x] Test exact 3-term Sellmeier equations for BK7, Fused Silica, Diamond, Sapphire, and Flint glasses
- [x] Task: Implement `src/engine/offline/spectralSampler.ts` to satisfy spectral and dispersion tests [af45372]
  - [x] Implement Planck blackbody and D65 spectral distribution functions
  - [x] Implement continuous CIE 1931 $\bar{x}, \bar{y}, \bar{z}$ integration and linear sRGB / Rec.709 conversion
  - [x] Implement exact Sellmeier dispersion coefficients and index evaluation
- [x] Task: Write failing unit tests for volumetric Rayleigh and Henyey-Greenstein / Mie scattering phase functions and free-flight sampling (`tests/offline/volumetricMedium.test.ts`) [1be445f]
  - [x] Test exponential free-flight distance sampling $s = -\ln(1-\xi)/\sigma_t$
  - [x] Test normalization and angular distribution of Rayleigh phase function $p_R(\theta)$
  - [x] Test forward/backward anisotropy in Henyey-Greenstein phase function $p_M(\theta, g)$
- [x] Task: Implement `src/engine/offline/volumetricMedium.ts` to pass scattering tests [e5c7d2a]
  - [x] Implement homogeneous/heterogeneous medium properties ($\sigma_a, \sigma_s, \sigma_t, g$)
  - [x] Implement collision sampling and scattering direction perturbation routines
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [e5c7d2a]

## Phase 2: Wave Optics & Adaptive Geodesic Integrator [checkpoint: 023bea1]
- [x] Task: Write failing unit tests for wave phase tracking, Huygens-Fresnel secondary wavelet generation, and slit interference (`tests/offline/waveOptics.test.ts`) [d1ccc42]
  - [x] Test complex wave phase $\phi = \vec{k}\cdot\vec{r} - \omega t$ propagation
  - [x] Test aperture discretization into secondary Huygens-Fresnel wavelet arrays
  - [x] Test electric field superposition $\tilde{E} = \sum E_k e^{i\phi_k}$ producing double-slit and Airy disc intensity profiles
- [x] Task: Implement `src/engine/offline/waveOptics.ts` [f0d0389]
  - [x] Implement secondary wavelet emitter generation for aperture slits and knife edges
  - [x] Implement coherent field accumulator and phase cancellation logic
- [x] Task: Write failing unit tests for adaptive RK45 / Symplectic geodesic integrator near Schwarzschild black holes (`tests/offline/geodesicIntegrator.test.ts`) [119b082]
  - [x] Test adaptive step size reduction near the photon sphere ($r = 1.5 r_s$)
  - [x] Test conservation of relativistic orbital energy and angular momentum
  - [x] Test horizon termination without numerical tunneling or infinite loop stalls
- [x] Task: Implement `src/engine/offline/geodesicIntegrator.ts` [023bea1]
  - [x] Implement adaptive Runge-Kutta-Fehlberg (RK45) / 4th-order Symplectic geodesic solver
  - [x] Implement dynamic step adjustment and event horizon capture
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [023bea1]

## Phase 3: Monte Carlo Photon Tracer & 32-bit Accumulator Target [checkpoint: 74ef290]
- [x] Task: Write failing unit tests for 32-bit float accumulation buffer, sample count mapping, and XYZ-to-sRGB progressive tonemapping (`tests/offline/accumulationTarget.test.ts`) [f66d621]
  - [x] Test `RGBA32F` tile buffer allocation, pixel splatting, and sample weight averaging
  - [x] Test dynamic exposure scaling and Reinhard/ACES tonemapping to 8-bit/16-bit display buffers
- [x] Task: Implement `src/engine/offline/accumulationTarget.ts` [9e89d32]
  - [x] Create high-precision `Float32Array` accumulation buffer with atomic/per-pixel sample counters
  - [x] Implement progressive frame reconstruction and blitting routines
- [x] Task: Write failing unit tests for bidirectional Monte Carlo ray/photon transport with Russian Roulette unbounded branching and geometry intersection (`tests/offline/mcPhotonTracer.test.ts`) [0ab6f49]
  - [x] Test unbounded Russian Roulette termination with continuation probability $P = \min(1.0, \max(R, T))$
  - [x] Test photon intersection against scene prisms, lenses, mirrors, barriers, and emitters
- [x] Task: Implement `src/engine/offline/mcPhotonTracer.ts` [74ef290]
  - [x] Implement core zero-GC Monte Carlo ray transport loop
  - [x] Implement Fresnel dielectric transmission/reflection branching and volume integration
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [74ef290]

## Phase 4: Web Worker Infrastructure & Scene Snapshot Pipeline
- [x] Task: Write failing unit tests for scene snapshot serialization / freeze protocol for offline render context (`tests/offline/sceneSnapshot.test.ts`) [dd1b81a]
  - [x] Test deep freezing of scene graph state into clean immutable transfer payload
  - [x] Test reconstruction of optical boundary primitives inside worker environment
- [x] Task: Implement `src/engine/offline/sceneSnapshot.ts` and background worker dispatcher `src/engine/offline/renderWorker.ts` [9bdc90b]
  - [x] Implement Web Worker entry point with chunked tile/photon packet processing
  - [x] Implement main-thread worker dispatcher with transferable ArrayBuffer streaming
- [~] Task: Write failing unit tests for Radiance 32-bit `.hdr` binary encoder and HDR/PNG export pipeline (`tests/offline/hdrExporter.test.ts`)
  - [ ] Test Radiance `.hdr` (RGBE 32-bit) format encoding and header specification
  - [ ] Test export data URL / Blob generation for PNG and HDR downloads
- [ ] Task: Implement `src/engine/offline/hdrExporter.ts`
  - [ ] Implement high-efficiency RGBE 32-bit RLE encoder
  - [ ] Implement browser file download triggers
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5: Production Render UI Dock, Modal & End-to-End Integration
- [ ] Task: Implement `src/ui/RenderModal.svelte`
  - [ ] Build modal overlay with progressive canvas preview
  - [ ] Display live statistics (samples count, photons dispatched, samples/sec, elapsed time)
  - [ ] Add Pause, Resume, Cancel, Exposure/Tonemap controls, and Export HDR / Export PNG buttons
- [ ] Task: Integrate "Render" action into `src/ui/Dock.svelte` and coordinate render worker lifecycle with main `App.svelte` / `engine.ts`
  - [ ] Add Render button with keyboard shortcut and tooltips to Dock
  - [ ] Hook into scene freeze and launch `RenderModal`
- [ ] Task: Write end-to-end integration tests for render worker lifecycle, snapshot transfer, progressive frame accumulation, and HDR export (`tests/offline/offlineRendererIntegration.test.ts`)
  - [ ] Test full worker launch, progressive batch reception, accumulation, and clean termination
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
