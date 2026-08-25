# Contributing to 2D Realistic Volumetric Optics Engine

Thank you for your interest in contributing to the **2D Realistic Volumetric Optics Engine**!

## Development Philosophy & Workflow

This project follows **Spec-Driven Development (SDD)** and strict **Test-Driven Development (TDD)**:
1. **Zero-Allocation Render Loops:** Runtime performance requires zero garbage-collected heap allocations inside per-frame ray solving and rendering routines.
2. **High Test Coverage:** All mathematical, geometric, and relativistic physics modules maintain >80% automated test coverage.
3. **Google TypeScript Style:** Clean TypeScript code following strict typing, named exports, single quotes, and explicit semicolons.

## Getting Started

```bash
# Clone repository
git clone https://github.com/Sayanthegamer/light-sim.git
cd light-sim

# Install dependencies
npm install

# Start local dev server
npm run dev

# Run unit tests
npm test

# Run type checker
npm run check

# Build for production
npm run build
```

## Pull Request Guidelines

1. Ensure all tests pass (`npm test`) and type checks pass with 0 errors (`npm run check`).
2. Add comprehensive unit tests in `tests/` for any new optical components, geometric primitives, or shader features.
3. Follow the commit format: `<type>(<scope>): <description>`.
