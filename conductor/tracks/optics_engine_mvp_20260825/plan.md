# Implementation Plan: Full Core Implementation: 2D Realistic Volumetric Optics Engine

## Phase 1: Project Scaffolding & Mathematical Foundations (CIE 1931 & Refraction/Dispersion Math) [checkpoint: c65f90d]

- [x] Task: Project Scaffolding & Build Pipeline Setup [5f3c457]
  - [x] Initialize `package.json` with TypeScript, Vite, `vite-plugin-glsl`, Svelte 5, Tailwind CSS, Lucide-Svelte, `lz-string`, and Vitest
  - [x] Configure `vite.config.ts`, `tsconfig.json`, and Tailwind CSS with Flat Matte Dark palette
  - [x] Verify test runner and build pipeline execution
- [x] Task: Zero-Allocation Inlined Math Module [32c6bc9]
  - [x] Write unit tests for 2D vector and scalar inlined math operations (`tests/math/vec2.test.ts`)
  - [x] Implement zero-allocation static vector and geometry utility module (`src/engine/math/vec2.ts`)
  - [x] Confirm all vector tests pass with 100% coverage
- [x] Task: Snell's Law, Cauchy Dispersion & Fresnel Energy Conservation Solvers [726c650]
  - [x] Write unit tests for refraction, Cauchy wavelength dispersion, and Fresnel coefficients (`tests/optics/refraction.test.ts`)
  - [x] Implement `refraction.ts` with Cauchy formula $n(\lambda) = A + B/\lambda^2$, Snell's vector refraction, and Fresnel $R+T=1$
  - [x] Confirm all optical refraction tests pass
- [x] Task: Analytic CIE 1931 Color Matching & Spectral Shaders [c65f90d]
  - [x] Write unit tests for analytic CIE 1931 $\lambda \to \text{sRGB}$ conversion (`tests/optics/cie1931.test.ts`)
  - [x] Implement `cie1931.ts` analytic wavelength-to-sRGB matching
  - [x] Create modular GLSL shader includes for spectral wavelength evaluation (`src/shaders/includes/cie1931.glsl`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [c65f90d]

---

## Phase 2: 2D Wavefront Geometry Engine & VBO Packing [checkpoint: e0dbe2a]

- [x] Task: Analytic 2D Ray-Segment & Ray-Arc Quadratic Intersection Solvers [10a6604]
  - [x] Write unit tests for line-segment and circle/arc quadratic intersections (`tests/geometry/intersections.test.ts`)
  - [x] Implement `intersections.ts` quadratic arc/circle and segment solvers with normal vectors
  - [x] Confirm geometric intersection tests pass
- [x] Task: 5-Step Adaptive Bisection Corner Snapping [d37d931]
  - [x] Write unit tests for boundary discontinuity detection and 5-step bisection corner snapping (`tests/geometry/bisection.test.ts`)
  - [x] Implement `bisection.ts` with $\epsilon < 0.5\text{ px}$ vertex snapping to prevent light leakage
  - [x] Confirm corner subdivision tests pass
- [x] Task: Branch Management & Energy Culling [72d20b7]
  - [x] Write unit tests for Fresnel tree recursion, $I < 0.005$ energy culling, and TIR max bounce depth $\le 8$ (`tests/geometry/branches.test.ts`)
  - [x] Implement branch traversal and recursive beam splitting manager (`src/engine/geometry/branchManager.ts`)
  - [x] Confirm branch culling tests pass
- [x] Task: 24-Byte Interleaved VBO Layout & Frustum Triangulation [e0dbe2a]
  - [x] Write unit tests for 24-byte interleaved packing `[Float32x2, Float32, Float32, Float32, Uint8x4]` (`tests/geometry/vboPacker.test.ts`)
  - [x] Implement `vboPacker.ts` with zero-allocation pre-allocated buffer writing
  - [x] Implement quad frustum and triangle fan mesh generators (`src/engine/geometry/frustumMesh.ts`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [e0dbe2a]

---

## Phase 3: Curvature Engine (Relativity, Geodesics & Black Holes) [checkpoint: 30eee67]

- [x] Task: Distance-Mapped Adaptive RK2 Geodesic Integrator [4fc3c18]
  - [x] Write unit tests for distance-scaled midpoint integration within $R_{\text{influence}} = 12 r_s$ (`tests/physics/rk2Integrator.test.ts`)
  - [x] Implement `rk2Integrator.ts` with step budget $N_{\text{max}} = 64$ and $\Delta t(r)$ scaling
  - [x] Confirm RK2 numerical convergence tests pass
- [x] Task: 4-Condition Priority Termination & Boundary Splicing [c93257b]
  - [x] Write unit tests for horizon capture $r \le r_s$, boundary exit $r \ge 12 r_s$, $2\pi$ winding cap, and smoothstep acceleration fade (`tests/physics/blackHoleBoundary.test.ts`)
  - [x] Implement boundary handoff and priority loop exit logic in `blackHoleBoundary.ts`
  - [x] Confirm termination conditions pass
- [x] Task: Double-Sided Quad Ribbon Mesh & Caustic Concentration [fc07f56]
  - [x] Write unit tests for ribbon quad strip generation and $\epsilon_{\text{pinch}} = 0.5\text{ px}$ inverse-width caustic scaling (`tests/physics/ribbonMesh.test.ts`)
  - [x] Implement `ribbonMesh.ts` generating unbroken contiguous quad strips
  - [x] Confirm ribbon mesh generation tests pass
- [x] Task: Vertex-Stage Gravitational Redshift & Extinction Damping [30eee67]
  - [x] Write unit tests for Schwarzschild dilation $(1+z) = (1 - r_s/r)^{-1/2}$ and $>780\text{ nm}$ extinction damping (`tests/physics/redshift.test.ts`)
  - [x] Implement `redshift.ts` vertex wavelength remapping and photopic luminance damping
  - [x] Confirm redshift tests pass
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [30eee67]

---

## Phase 4: Atmospheric Post-Processing & Multi-Pass HDR Pipeline [checkpoint: c85ff00]

- [x] Task: Extension-Guarded HDR Framebuffers & WebGL2 Pipeline [f75af8c]
  - [x] Implement WebGL2 resource manager (`src/engine/renderer/webglContext.ts`) with `RGBA16F` half-float FBOs and `RGBM` 8-bit fallback
  - [x] Implement Pass 1 forward beam rasterizer with additive blending (`gl.SRC_ALPHA, gl.ONE`) and disabled backface culling
  - [x] Verify FBO creation, depth attachments, and context restoration
- [x] Task: Obstacle Geometry Mask Rasterization (Pass 2) [39a8ec1]
  - [x] Create Pass 2 shaders and FBO for dedicated 1-byte `R8` obstacle geometry mask (`src/shaders/mask.vert`, `src/shaders/mask.frag`)
  - [x] Implement obstacle mask renderer preventing light bleeding into solid glass/prisms (`src/engine/renderer/maskPass.ts`)
- [x] Task: Two-Tier Hybrid Scatter Filter (Pass 3) [ca97fe4]
  - [x] Implement 1/2-res 5-tap depth-masked bilateral Gaussian blur shader (`src/shaders/bilateralScatter.frag`)
  - [x] Implement 2-stage Dual Kawase downsampler/upsampler for ambient Mie/Rayleigh dust haze (`src/shaders/dualKawase.frag`, `src/engine/renderer/scatterPass.ts`)
- [x] Task: Extended Reinhard Tonemapping & Composite (Pass 4) [853e92e]
  - [x] Implement linear luminance-weighted Extended Reinhard tonemapper shader ($L_{\text{white}} = 4.0$) + sRGB gamma correction ($\gamma = 2.2$) (`src/shaders/compositeTonemap.frag`)
  - [x] Implement final screen blit pass (`src/engine/renderer/compositePass.ts`)
- [x] Task: 8-Frame Progressive EMA Temporal Accumulator & Idle Sleep [c85ff00]
  - [x] Implement ping-pong accumulation buffer manager with exponential moving average (`src/engine/renderer/temporalAccumulator.ts`)
  - [x] Implement dirty-state event-driven render coordinator with idle sleep state (`src/engine/renderer/renderLoop.ts`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [c85ff00]

---

## Phase 5: Interactive Scene Graph, Preset Library & Svelte 5 Flat Matte UI

- [x] Task: Polymorphic Scene Graph & Flat Boundary Cache [c309807]
  - [ ] Write unit tests for SceneNode hierarchy and flat boundary cache flattening (`tests/scene/sceneGraph.test.ts`)
  - [ ] Implement `SceneNode`, `EmitterNode`, `PrismNode`, `LensNode`, `BlackHoleNode`, and `BarrierNode` (`src/engine/scene/`)
  - [ ] Confirm cache invalidation on `TRANSFORM_DIRTY` and `PARAM_DIRTY` flags
- [x] Task: Direct 2D Canvas Vector Hit-Testing & Gizmo Manipulation [daaf14e]
  - [ ] Implement canvas pointer event raycasting (point-in-polygon, circle distance, transform handles) (`src/engine/interaction/hitTester.ts`, `src/engine/interaction/gizmoController.ts`)
  - [ ] Implement smooth translation, rotation pivots, and aperture/radius resize handles
- [x] Task: 32-Slot Snapshot Undo/Redo Engine [46ccf48]
  - [ ] Write unit tests for circular history buffer and deterministic undo/redo (`tests/state/historyManager.test.ts`)
  - [ ] Implement `historyManager.ts` committing immutable scene snapshots on pointer-up
- [ ] Task: Canonical JSON Serialization, `lz-string` URL Hash & 5 Bundled Presets
  - [ ] Write unit tests for JSON serialization and `lz-string` compression/decompression (`tests/state/serializer.test.ts`)
  - [ ] Implement `serializer.ts` with URL hash fragment sync
  - [ ] Create 5 bundled presets: Newton's Prism, Convex/Concave Focus, Schwarzschild Relativistic Deflection, TIR Retroreflector, and Achromatic Doublet (`src/engine/presets/`)
- [ ] Task: Svelte 5 Flat Matte Dark UI & Properties Inspector
  - [ ] Build top/bottom perimeter toolbars with preset selector, play/pause, reset, undo/redo, and add object menu (`src/ui/Dock.svelte`)
  - [ ] Build floating context-sensitive properties inspector for selected entities (`src/ui/Inspector.svelte`)
  - [ ] Apply Flat Matte Dark styling (solid slate/zinc, 1px `#27272a` borders, zero backdrop blur)
  - [ ] Integrate master application root (`src/App.svelte`, `src/main.ts`)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

---

## Phase: Review Fixes

- [x] Task: Apply review suggestions [62b9ed3]
- [x] Task: Apply review suggestions for Phase 2 [26239c7]
- [x] Task: Apply review suggestions for Phase 3 [14517a4]
- [x] Task: Apply review suggestions for Phase 4 [e75f49c]


