# Product Guidelines: 2D Realistic Volumetric Optics Engine

## 1. Visual Design & Theme System

### Flat Matte Dark Aesthetic
- **Surfaces & Panels:** Solid opaque dark panels (`bg-slate-900` / `bg-zinc-900`, `#0f172a` / `#18181b`) with subtle 1px contrast borders (`border-zinc-800`, `#27272a`).
- **No Backdrop Blur:** Strictly **zero** `backdrop-filter: blur()` or heavy CSS filters to prevent browser compositing stalls and reserve 100% of GPU fill-rate for WebGL2 volumetric render passes.
- **High-Contrast Legibility:** High-contrast neutral text (`text-zinc-100`, `text-zinc-400`) ensuring crisp readability over bright optical caustics.

### Typography & Data Display
- **UI & Controls:** Clean, modern sans-serif (`Inter`, `Geist`, or clean system sans-serif).
- **Physical Readouts:** Tabular monospace font (`JetBrains Mono`, `Fira Code`) for precise scientific values (wavelengths $\lambda \in [380, 780]\text{ nm}$, refractive indices $n$, Schwarzschild radii $r_s$, Cauchy coefficients $A$, $B$).

## 2. Interaction & UX Principles

### Direct On-Canvas Manipulation
- **Unified Vector Hit-Testing:** Scene elements (emitters, prisms, lenses, black holes) are manipulated directly on the WebGL canvas via pointer events with zero DOM reflow jitter.
- **Contextual On-Canvas Gizmos:** Subtle transform rings, angle indicators, and focal handles appear directly on active objects when selected.
- **Decoupled State Pipeline:** Slider gestures and gizmo drags update engine dirty flags directly (`TRANSFORM_DIRTY` / `PARAM_DIRTY`), keeping the 60 FPS WebGL loop completely unblocked.

### Dock & Inspector Layout
- **Floating Perimeter Dock:** Minimalist bottom/top docked toolbars anchored to screen edges so the central optical canvas remains completely unobstructed.
- **Compact Floating Inspector:** Context-sensitive inspector panel displaying physical properties for the currently selected optical entity.

### Fast Undo/Redo & State Management
- **Deterministic 32-Slot Ring Buffer:** Snapshots are captured strictly on pointer-up or parameter commit, ignoring intermediate continuous drag frames.
- **Keyboard Ergonomics:** Standard shortcuts (`Ctrl+Z` / `Ctrl+Y` for undo/redo, `Delete` / `Backspace` to remove selected, `Space` for beam freeze/unfreeze, `R` to reset).

## 3. Voice, Tone & Documentation
- **Engineering Clarity:** Scientific, authoritative, and concise terminology across tooltips, labels, and preset descriptions.
- **Physical Accuracy:** Labels reflect real-world physics (e.g., "Cauchy Dispersion $B$", "Schwarzschild Radius $r_s$", "Wavelength $\lambda$ in nm", "Fresnel Transmission $T$").
