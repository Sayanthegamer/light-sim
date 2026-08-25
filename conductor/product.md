# Product Definition: 2D Realistic Volumetric Optics Engine

## Vision & Philosophy
The **2D Realistic Volumetric Optics Engine** is a real-time, high-fidelity physical optics and curved spacetime simulation platform designed to deliver smooth 60 FPS performance on budget integrated GPUs (such as Intel UHD / Iris Xe). 

Unlike conventional 2D raytracers that depict light as discrete 1D laser needles or 3-channel RGB lines, this engine treats light as a **continuous 2D radiant energy field**. Wavefronts expand into continuous polygonal frustums and ribbon strips, refract continuously across the entire visible spectrum ($\lambda \in [380, 780]\text{ nm}$) via analytic CIE 1931 color-matching equations, and curve organically around Schwarzschild black holes.

## Core Pillars & Physical Capabilities

### 1. Continuous Wavefront Transport & Dispersion
- **Polygonal Beam Frustums:** Light is represented as continuous 2D quads and triangle fans bounded by outer wavefront trajectories.
- **Continuous CIE 1931 Spectrum:** Analytic color matching in fragment shaders ensures smooth, unstriped rainbow gradients without discrete wavelength sampling gaps.
- **Snell's Law & Cauchy Dispersion:** Refraction follows $n(\lambda) = A + B/\lambda^2$, fanning continuous spectra at optical interfaces.
- **Fresnel Energy Conservation:** Energy splits into transmitted and reflected components ($R + T = 1$), naturally attenuating secondary bounces.

### 2. High-Performance 2D Geometry Engine
- **Pre-Allocated CPU Triangulation:** CPU solves analytic geometric intersections (line segments and circular/parabolic arcs) and writes directly into fixed typed arrays.
- **5-Step Bisection Corner Snapping:** Resolves geometric discontinuities at obstacle vertices with sub-pixel precision ($\epsilon < 0.5\text{ px}$), preventing light leakage.
- **Auto-Expanding Frame Pool & TIR Cap:** Frame-level dynamically growable pool (amortized zero-GC) with sub-threshold energy pruning ($I < 0.005$), zero cross-sample mutation, and hard TIR bounce limit of 8 bounces.
- **24-Byte Interleaved VBO Layout:** `[Float32x2: a_Position (x,y), Float32: a_Intensity, Float32: a_DispersionU, Float32: a_EdgeV, Uint8x4: a_ParentColorRGB]`.

### 3. Non-Euclidean Spacetime & Curvature Engine
- **Distance-Mapped Adaptive RK2 Geodesic Integrator:** Localized field marching inside $R_{\text{influence}} = 12 r_s$ with a 256-step budget ($N_{\text{max}} = 256$) and smoothstep boundary transition over $[10 r_s, 12 r_s]$.
- **Contiguous Ribbon Meshes:** Quad strips rendered double-sided with additive blending, using $\epsilon_{\text{pinch}} = 0.5\text{ px}$ to focus caustic energy spikes.
- **Relativistic Redshift & Dilation:** Vertex-stage Schwarzschild wavelength scaling $(1+z) = (1 - r_s/r)^{-1/2}$ and smooth extinction damping beyond 780 nm.
- **Symmetric Entry, Partial Grazing Partitioning & Splicing:** Order-agnostic boundary entry, bisection tangent partitioning for grazing finite-width beams, 4-condition loop termination, and optical ray continuation into downstream optical elements.

### 4. Atmospheric Post-Processing & HDR Pipeline
- **Extension-Guarded Half-Float HDR:** Half-resolution `RGBA16F` offscreen framebuffer with `RGBM` 8-bit fallback.
- **Obstacle Geometry Mask:** Dedicated 1-byte `R8` mask texture preventing light from bleeding into solid glass and barriers.
- **Two-Tier Hybrid Volumetric Scatter:** 1/2-res 5-tap depth-masked bilateral Gaussian filter + 2-stage Dual Kawase downsampler for wide Rayleigh/Mie dust haze.
- **Tonemapping & Gamut Mapping:** Linear luminance-weighted Extended Reinhard tonemapper ($L_{\text{white}} = 4.0$) with sRGB gamma correction ($\gamma = 2.2$).

### 5. Runtime Architecture & Interaction
- **Polymorphic Scene Graph:** OOP hierarchy (Emitter, Prism, Lens, BlackHole) caching flat boundary arrays upon `TRANSFORM_DIRTY` / `PARAM_DIRTY` flags.
- **Direct Canvas Vector Raycasting:** Sub-pixel pointer hit-testing directly on canvas events without DOM reflow lag.
- **32-Slot Pointer-Up Snapshot History:** Deterministic undo/redo ring buffer committed strictly on pointer release.
- **State Serialization:** Canonical structured JSON schema paired with `lz-string` URL hash compression for instant preset sharing.
- **Lifecycle Power Management:** Single-pass 60 FPS during drag, 8-frame progressive EMA accumulation when static, and idle render sleep.
