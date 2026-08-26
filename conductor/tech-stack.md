# Technology Stack: 2D Realistic Volumetric Optics Engine

## Core Technologies & Dependencies

| Layer / Subsystem | Selected Technology | Version / Spec | Technical Justification |
| :--- | :--- | :--- | :--- |
| **Primary Language** | TypeScript | `~5.x` | Strict compile-time typing for 24-byte vertex strides, typed array offsets, and polymorphic scene node contracts. |
| **Graphics API** | WebGL2 Native Context | GLSL 3.00 ES | Native support for Multiple Render Targets (MRT), float/half-float framebuffers, flat varying interpolation, and zero-overhead GPU rasterization. |
| **UI Framework** | Svelte 5 (Runes) | `^5.x` | Fine-grained reactivity without virtual DOM reconciliation; updates parameters on high-frequency drag events without UI stutter or GC overhead. |
| **Styling & Icons** | Tailwind CSS + Lucide-Svelte | `^3.x` / `^0.x` | Flat Matte Dark Theme (`slate-900` / `zinc-900`, 1px borders), zero `backdrop-filter: blur()`, tree-shakeable SVG icons. |
| **Build & Tooling** | Vite + `vite-plugin-glsl` | `^6.x` | Near-instant HMR dev server, TypeScript compilation, and raw `.vert`/`.frag` modular GLSL shader imports. |
| **Math & Physics Engine** | Custom Inlined Math Module | Custom Zero-GC | Pure static scalar and typed buffer math operations; completely eliminates throwaway heap allocations inside the render loop. |
| **State Compression** | `lz-string` | `^1.5.x` | Lightweight (~3 KB) compression library encoding JSON scene graphs into clean Base64 URL hash fragments for instant sharing. |
| **Testing Framework** | Vitest | `^2.x` | High-speed unit testing for Snell/Cauchy refraction math, RK2 integrators, and geometry subdivision. |

## Memory & Performance Architecture

- **Vertex Buffer Layout:** 24-byte interleaved single-VBO:
  - `Float32x2: a_Position (x, y)` (8 bytes)
  - `Float32: a_Intensity` (4 bytes)
  - `Float32: a_DispersionU` (4 bytes)
  - `Float32: a_EdgeV` (4 bytes)
  - `Uint8x4: a_ParentColorRGB` (4 bytes)
- **Buffer Update Strategy:** Fixed, pre-allocated typed array written via `gl.bufferSubData`.
- **4-Pass Render Pipeline:**
  1. Pass 1: Forward Beam Quad Rasterization (`RGBA16F` HDR buffer, additive blend)
  2. Pass 2: Obstacle Geometry Mask Rasterization (`R8` mask texture)
  3. Pass 3: 2-Tier Scatter Filter (Depth-Masked Bilateral Gaussian + 2-Stage Dual Kawase Bloom)
  4. Pass 4: Composite & Tonemap Blit (Luminance-Weighted Extended Reinhard + sRGB Gamma)
- **Temporal Management:** 60 FPS single-pass dragging, 8-frame progressive EMA accumulation when static, sleep state when idle.

## Offline Production Renderer Architecture

- **Multi-Threaded Web Worker Pool:** Concurrency auto-scales to `navigator.hardwareConcurrency` with dynamic sample budget division across worker threads.
- **Zero-Allocation Transport Kernel:** Scene geometry primitives and Sellmeier/Cauchy glass dispersion indices are extracted once per job; inner photon loops reuse pre-allocated scratch contexts with zero garbage collection churn.
- **Progressive HDR Accumulation:** Background workers periodically post float buffers; `AccumulationTarget.mergeBuffer` sums multi-threaded radiance for real-time preview and 32-bit Radiance `.hdr` export.

