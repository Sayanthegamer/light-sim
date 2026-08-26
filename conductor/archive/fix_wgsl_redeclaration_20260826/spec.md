**Overview**
The GPU Renderer fails to execute the rendering pass when triggered. Instead of rendering, the canvas becomes pitch black and the progress bar rapidly completes. This is caused by a WebGPU compute shader compilation failure in `PhotonTransportComputeShader` due to the redeclaration of the `bestHit` and `closestT` variables in the WGSL source code.

**Functional Requirements**
- Resolve the variable redeclaration errors for `bestHit` and `closestT` in the `PhotonTransportComputeShader` (likely located in `src/engine/offline/gpu/shaders/photonTransport.wgsl` or a generated shader string).
- Ensure the compute pipeline compiles successfully without WebGPU validation errors.
- The GPU render pass must successfully execute and output a rendered image to the canvas instead of a black screen.

**Acceptance Criteria**
- When selecting "GPU" in the Renderer settings and hitting render, the scene renders successfully.
- The browser developer console is free of WGSL parsing and validation errors related to variable redeclarations.
- The GPU renderer produces the exact same visual output as the CPU renderer.

**Out of Scope**
- Major architectural changes to the WebGPU rendering pipeline.
- Fixing unrelated bugs or adding new features to the optics engine.
