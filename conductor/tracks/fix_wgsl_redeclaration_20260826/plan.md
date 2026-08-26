# Implementation Plan: Bug Fix: WGSL Shader Redeclaration Error

## Overview
Fix WebGPU compute shader compilation errors by resolving variable redeclarations for `bestHit` and `closestT` in the `PhotonTransportComputeShader`, allowing the GPU renderer to execute successfully.

---

## Phase 1: Test & Implementation of Shader Fix [checkpoint: 60b0dae]

- [x] Task: Write Failing Tests (Red Phase)
    - [x] Create or update tests verifying WebGPU compute pipeline creation succeeds without compilation errors or warnings.
- [x] Task: Implement to Pass Tests (Green Phase) [60b0dae]
    - [x] Locate `PhotonTransportComputeShader` WGSL source code (likely in `src/engine/offline/gpu/shaders/photonTransport.wgsl`).
    - [x] Remove or correct the redeclarations of the `bestHit` and `closestT` variables to fix the scope conflict.
- [x] Task: Verify Tests and Type Safety
    - [x] Run `CI=true npx vitest run` to ensure all optical tests pass and the pipeline initializes correctly.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
