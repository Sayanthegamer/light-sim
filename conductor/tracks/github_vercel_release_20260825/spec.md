# Track Specification: GitHub Repository Setup, MIT Licensing & Vercel Deployment

## 1. Overview
This track finalizes the **2D Realistic Volumetric Optics Engine** for official open-source release on GitHub and zero-config deployment on Vercel:
1. **Legal Copyright & Safeguards**: Adding standard MIT License protecting author `Sayan / sayanthegamer` (`sayanbnk2008@gmail.com`), plus open-source security and contribution policies.
2. **Vercel Deployment Readiness**: Creating `vercel.json` with SPA routing rewrite rules, caching policies for WebGL/WASM assets, and clean production build validation.
3. **Repository Polish & Readme**: Creating a comprehensive, scientific, and visually striking `README.md` documenting physics models, architecture, controls, presets, and local development.
4. **Git Remote & Synchronization**: Setting up Git author identity, configuring upstream remote `https://github.com/Sayanthegamer/light-sim.git`, and pushing the master branch.

## 2. Functional Requirements

### 2.1 Legal & Licensing Safeguards
- Root `LICENSE` file containing standard MIT License terms:
  ```
  MIT License
  Copyright (c) 2026 Sayan (sayanthegamer) <sayanbnk2008@gmail.com>
  ```
- `SECURITY.md` defining responsible disclosure guidelines.
- `CONTRIBUTING.md` outlining standard TDD and Spec-Driven Development contribution workflows.
- `package.json` metadata update: adding `name`, `author`, `license: "MIT"`, `repository`, `homepage`, and keywords.

### 2.2 Vercel Deployment Configuration
- `vercel.json` specifying:
  - Framework: `vite`
  - Output directory: `dist`
  - Rewrites: SPA wildcard redirect `[ { "source": "/(.*)", "destination": "/index.html" } ]`
  - Header caching: Long-term immutable caching for static assets (`/assets/*`).
- Verification that `npm run build` and `npm run check` succeed with 0 warnings.

### 2.3 Documentation & Showcase
- Comprehensive `README.md`:
  - Project Title, Badges (License, Vitest, TypeScript, Svelte 5, WebGL2).
  - High-level physics summary: Continuous 2D Wavefronts, Analytic CIE 1931, Snell/Cauchy refraction, RK2 curved spacetime geodesics, 2-tier HDR volumetric scatter.
  - Interactive UI guide: Canvas dragging, rotation/aperture gizmos, 5 presets, undo/redo ring buffer, URL preset compression.
  - Architecture diagram and technology breakdown.
  - Setup and deployment instructions for Vercel and local dev.

### 2.4 Git Remote Setup & Push
- Set local repository user name `sayanthegamer` and user email `sayanbnk2008@gmail.com`.
- Add or configure remote `origin` pointing to `https://github.com/Sayanthegamer/light-sim.git`.
- Push the repository (`master` / `main`) with full commit history to GitHub.

## 3. Non-Functional Requirements
- Zero build errors or linter warnings.
- Clean working directory with no untracked temp files.
- Preserved 100% test passing status (135 tests).

## 4. Acceptance Criteria
1. `LICENSE` (MIT) created with copyright for `Sayan (sayanthegamer)`.
2. `vercel.json` configured and verified.
3. `package.json` updated with full package metadata.
4. `README.md` complete and formatted.
5. All code and commits pushed successfully to `https://github.com/Sayanthegamer/light-sim.git`.

## 5. Out of Scope
- Backend database integration or custom authentication servers.
