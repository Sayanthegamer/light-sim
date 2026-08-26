# Implementation Plan: Bug Fix: WGSL Shader Redeclaration Error

## Overview
Fix WebGPU compute shader compilation errors by resolving variable redeclarations for `bestHit` and `closestT` in the `PhotonTransportComputeShader`, allowing the GPU renderer to execute successfully.

---

## Phase 1: Test & Implementation of Shader Fix

- [ ] Task: Write Failing Tests (Red Phase)
    - [ ] Create or update tests verifying WebGPU compute pipeline creation succeeds without compilation errors or warnings.
- [ ] Task: Implement to Pass Tests (Green Phase)
    - [ ] Locate `PhotonTransportComputeShader` WGSL source code (likely in `src/engine/offline/gpu/shaders/photonTransport.wgsl`).
    - [ ] Remove or correct the redeclarations of the `bestHit` and `closestT` variables to fix the scope conflict.
- [ ] Task: Verify Tests and Type Safety
    - [ ] Run `CI=true npx vitest run` to ensure all optical tests pass and the pipeline initializes correctly.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
