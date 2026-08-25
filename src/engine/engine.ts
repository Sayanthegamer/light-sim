/**
 * OpticsEngine: Master Execution Pipeline & Runtime Coordinator
 *
 * Integrates:
 * - CPU Analytic Optical & Curvature Solvers (Phase 1, 2, 3)
 * - Multi-Pass WebGL2 HDR Post-Processing Pipeline (Phase 4)
 * - Interactive Scene Graph, Direct 2D Canvas Gizmos, History, & Presets (Phase 5)
 */

import { WebGLContextManager, type FramebufferResource } from './renderer/webglContext';
import { RenderCoordinator, RenderState } from './renderer/renderLoop';
import { SceneGraph } from './scene/sceneGraph';
import { GizmoController } from './interaction/gizmoController';
import { HistoryManager } from './state/historyManager';
import { serializeToJSON, deserializeFromJSON, type SerializedScene } from './state/serializer';
import { BranchManager, type BeamFrustum } from './geometry/branchManager';
import { VboPacker, generateQuadFrustumMesh } from './geometry/vboPacker';
import { calculateAdaptiveDt, stepRK2, createGeodesicTrajectory } from './physics/rk2Integrator';
import { intersectRayInfluenceBoundary, type BoundaryRayHandOff } from './physics/blackHoleBoundary';
import { generateRibbonMesh } from './physics/ribbonMesh';
import { newtonPrismPreset } from './presets/newtonPrism';

export interface EngineStats {
  fps: number;
  nodeCount: number;
  vertexCount: number;
  activeFrustums: number;
  solveTimeMs: number;
  renderTimeMs: number;
  renderState: RenderState;
}

export interface EngineOptions {
  initialPreset?: SerializedScene;
  onStatsUpdate?: (stats: EngineStats) => void;
  onSceneChange?: () => void;
}

export class OpticsEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly glManager: WebGLContextManager;
  private readonly renderCoordinator: RenderCoordinator;
  private readonly scene: SceneGraph;
  private readonly gizmoController: GizmoController;
  private readonly historyManager: HistoryManager;
  private readonly branchManager: BranchManager;
  private readonly vboPacker: VboPacker;

  private beamFbo: FramebufferResource;
  private maskFbo: FramebufferResource;

  private width: number;
  private height: number;
  private isPausedFlag = false;
  private animationFrameId: number | null = null;

  // Post-processing settings
  exposure = 1.0;
  whitePoint = 4.0;
  hazeDensity = 0.35;
  bloomIntensity = 0.25;
  scatterWeight = 1.0;

  // Performance telemetry
  private stats: EngineStats = {
    fps: 60,
    nodeCount: 0,
    vertexCount: 0,
    activeFrustums: 0,
    solveTimeMs: 0,
    renderTimeMs: 0,
    renderState: RenderState.Interacting
  };

  private lastFrameTime = performance.now();
  private frameCount = 0;
  private options: EngineOptions;

  // Reusable solver containers (zero GC)
  private readonly reusableTrajectoryLeft = createGeodesicTrajectory();
  private readonly reusableTrajectoryRight = createGeodesicTrajectory();
  private readonly reusableHandOffLeft: BoundaryRayHandOff = {
    hasIntersection: false,
    entryPoint: { x: 0, y: 0 },
    exitPoint: { x: 0, y: 0 },
    tEntry: 0,
    tExit: 0
  };
  private readonly reusableHandOffRight: BoundaryRayHandOff = {
    hasIntersection: false,
    entryPoint: { x: 0, y: 0 },
    exitPoint: { x: 0, y: 0 },
    tEntry: 0,
    tExit: 0
  };

  private readonly scratchPos: { x: number; y: number } = { x: 0, y: 0 };
  private readonly scratchVel: { x: number; y: number } = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, options?: EngineOptions) {
    this.canvas = canvas;
    this.options = options ?? {};
    this.width = Math.max(1, canvas.clientWidth || canvas.width || 800);
    this.height = Math.max(1, canvas.clientHeight || canvas.height || 600);

    this.glManager = new WebGLContextManager(canvas);
    this.renderCoordinator = new RenderCoordinator(this.glManager, this.width, this.height);
    this.scene = new SceneGraph();
    this.historyManager = new HistoryManager();
    this.branchManager = new BranchManager();
    this.vboPacker = new VboPacker(8192);

    this.beamFbo = this.glManager.createHDRFramebuffer(this.width, this.height);
    this.maskFbo = this.glManager.createSingleChannelFramebuffer(this.width, this.height);

    this.gizmoController = new GizmoController(this.scene, {
      onInteractionStart: () => {
        this.renderCoordinator.markDirty(true);
      },
      onInteractionUpdate: () => {
        this.renderCoordinator.markDirty(true);
        this.options.onSceneChange?.();
      },
      onInteractionCommit: () => {
        this.commitHistorySnapshot();
        this.renderCoordinator.markDirty(false);
        this.options.onSceneChange?.();
      }
    });

    // Load initial scene
    this.loadPreset(options?.initialPreset ?? newtonPrismPreset);

    this.attachPointerListeners();
  }

  getScene(): SceneGraph {
    return this.scene;
  }

  getGizmoController(): GizmoController {
    return this.gizmoController;
  }

  getHistoryManager(): HistoryManager {
    return this.historyManager;
  }

  getRenderCoordinator(): RenderCoordinator {
    return this.renderCoordinator;
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  getStats(): EngineStats {
    return this.stats;
  }

  isPaused(): boolean {
    return this.isPausedFlag;
  }

  setPaused(paused: boolean): void {
    this.isPausedFlag = paused;
    this.renderCoordinator.markDirty(false);
  }

  loadPreset(preset: SerializedScene): void {
    deserializeFromJSON(JSON.stringify(preset), this.scene);
    this.historyManager.clear();
    this.commitHistorySnapshot();
    this.renderCoordinator.markDirty(true);
    this.options.onSceneChange?.();
  }

  commitHistorySnapshot(): void {
    const json = serializeToJSON(this.scene);
    this.historyManager.pushSnapshot(json);
  }

  canUndo(): boolean {
    return this.historyManager.canUndo();
  }

  canRedo(): boolean {
    return this.historyManager.canRedo();
  }

  undo(): void {
    const json = this.historyManager.undo();
    if (json) {
      deserializeFromJSON(json, this.scene);
      this.renderCoordinator.markDirty(true);
      this.options.onSceneChange?.();
    }
  }

  redo(): void {
    const json = this.historyManager.redo();
    if (json) {
      deserializeFromJSON(json, this.scene);
      this.renderCoordinator.markDirty(true);
      this.options.onSceneChange?.();
    }
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.glManager.resizeFramebuffer(this.beamFbo, this.width, this.height);
    this.glManager.resizeFramebuffer(this.maskFbo, this.width, this.height);
    this.renderCoordinator.resize(this.width, this.height);
  }

  private attachPointerListeners(): void {
    if (!this.canvas.addEventListener) return;

    const getCanvasPos = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / (rect.width || 1);
      const scaleY = this.height / (rect.height || 1);
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      const pos = getCanvasPos(e);
      this.gizmoController.onPointerDown(pos.x, pos.y);
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', (e: PointerEvent) => {
        if (this.gizmoController.isDragging()) {
          const pos = getCanvasPos(e);
          this.gizmoController.onPointerMove(pos.x, pos.y);
        }
      });

      window.addEventListener('pointerup', () => {
        if (this.gizmoController.isDragging()) {
          this.gizmoController.onPointerUp();
        }
      });
    }
  }

  solveLightField(): void {
    const t0 = performance.now();
    this.scene.updateFlatCache();
    this.vboPacker.reset();

    const segments = this.scene.getCachedSegments();
    const arcs = this.scene.getCachedArcs();
    const corners = this.scene.getCachedCorners();
    const blackHoles = this.scene.getCachedBlackHoles();
    const emitters = this.scene.getEmitters();

    let activeFrustums = 0;

    for (let e = 0; e < emitters.length; e++) {
      const emitter = emitters[e];
      const rays = emitter.generateInitialRays();

      if (emitter.isWhiteLight) {
        // Continuous spectral sample sweep
        const samples = emitter.spectralSamples || 16;
        for (let k = 0; k < samples; k++) {
          const u = k / (samples - 1);
          const initialFrustum: BeamFrustum = {
            id: 0,
            depth: 0,
            leftRay: { origin: { ...rays.leftRay.origin }, dir: { ...rays.leftRay.dir } },
            rightRay: { origin: { ...rays.rightRay.origin }, dir: { ...rays.rightRay.dir } },
            leftHit: { x: 0, y: 0 },
            rightHit: { x: 0, y: 0 },
            intensity: emitter.intensity / samples,
            dispersionU: u,
            tintRGB: [255, 255, 255],
            isDispersed: true
          };

          const frustums = this.branchManager.traceLightTree(
            initialFrustum,
            segments,
            arcs,
            corners
          );

          for (let f = 0; f < frustums.length; f++) {
            generateQuadFrustumMesh(this.vboPacker, frustums[f]);
            activeFrustums++;
          }
        }
      } else {
        // Monochromatic beam
        const u = (emitter.wavelength - 380) / (780 - 380);
        const initialFrustum: BeamFrustum = {
          id: 0,
          depth: 0,
          leftRay: { origin: { ...rays.leftRay.origin }, dir: { ...rays.leftRay.dir } },
          rightRay: { origin: { ...rays.rightRay.origin }, dir: { ...rays.rightRay.dir } },
          leftHit: { x: 0, y: 0 },
          rightHit: { x: 0, y: 0 },
          intensity: emitter.intensity,
          dispersionU: u,
          tintRGB: [255, 255, 255],
          isDispersed: false
        };

        const frustums = this.branchManager.traceLightTree(
          initialFrustum,
          segments,
          arcs,
          corners
        );

        for (let f = 0; f < frustums.length; f++) {
          generateQuadFrustumMesh(this.vboPacker, frustums[f]);
          activeFrustums++;
        }
      }

      // Relativistic Black Hole Geodesic Solver
      for (let b = 0; b < blackHoles.length; b++) {
        const bh = blackHoles[b];
        const hasLeftEntry = intersectRayInfluenceBoundary(this.reusableHandOffLeft, rays.leftRay, bh);
        const hasRightEntry = intersectRayInfluenceBoundary(this.reusableHandOffRight, rays.rightRay, bh);

        if (hasLeftEntry && hasRightEntry) {
          // Left trajectory
          const trajL = this.reusableTrajectoryLeft;
          trajL.pointCount = 0;
          let curPosL = { ...this.reusableHandOffLeft.entryPoint };
          let curVelL = { ...rays.leftRay.dir };

          for (let step = 0; step < 64; step++) {
            const rx = curPosL.x - bh.center.x;
            const ry = curPosL.y - bh.center.y;
            const r = Math.sqrt(rx * rx + ry * ry);
            if (r <= bh.rs || r >= bh.rInfluence * 1.05) break;

            const dt = calculateAdaptiveDt(r, bh.rs, bh.rInfluence);
            stepRK2(this.scratchPos, this.scratchVel, curPosL, curVelL, bh, dt);
            curPosL.x = this.scratchPos.x;
            curPosL.y = this.scratchPos.y;
            curVelL.x = this.scratchVel.x;
            curVelL.y = this.scratchVel.y;

            trajL.pointsX[step] = curPosL.x;
            trajL.pointsY[step] = curPosL.y;
            trajL.radii[step] = r;
            trajL.pointCount++;
          }

          // Right trajectory
          const trajR = this.reusableTrajectoryRight;
          trajR.pointCount = 0;
          let curPosR = { ...this.reusableHandOffRight.entryPoint };
          let curVelR = { ...rays.rightRay.dir };

          for (let step = 0; step < 64; step++) {
            const rx = curPosR.x - bh.center.x;
            const ry = curPosR.y - bh.center.y;
            const r = Math.sqrt(rx * rx + ry * ry);
            if (r <= bh.rs || r >= bh.rInfluence * 1.05) break;

            const dt = calculateAdaptiveDt(r, bh.rs, bh.rInfluence);
            stepRK2(this.scratchPos, this.scratchVel, curPosR, curVelR, bh, dt);
            curPosR.x = this.scratchPos.x;
            curPosR.y = this.scratchPos.y;
            curVelR.x = this.scratchVel.x;
            curVelR.y = this.scratchVel.y;

            trajR.pointsX[step] = curPosR.x;
            trajR.pointsY[step] = curPosR.y;
            trajR.radii[step] = r;
            trajR.pointCount++;
          }

          if (trajL.pointCount > 2 && trajR.pointCount > 2) {
            generateRibbonMesh(this.vboPacker, trajL, trajR, emitter.intensity, 0.5, [255, 255, 255]);
          }
        }
      }
    }

    this.stats.solveTimeMs = performance.now() - t0;
    this.stats.activeFrustums = activeFrustums;
    this.stats.vertexCount = this.vboPacker.getVertexCount();
    this.stats.nodeCount = this.scene.getAllNodes().length;
  }

  renderFrame(): void {
    const t0 = performance.now();

    // 1. CPU Ray Solving
    this.solveLightField();

    // 2. GPU Pass 1: Forward Beam Quad Rasterization
    this.renderCoordinator.beamPass.begin(this.beamFbo, this.width, this.height);
    this.renderCoordinator.beamPass.render(this.vboPacker);

    // 3. GPU Pass 2: Obstacle Geometry Mask Rasterization
    this.renderCoordinator.maskPass.begin(this.maskFbo, this.width, this.height);
    this.renderCoordinator.maskPass.renderPolygons(this.scene.getCachedObstaclePolygons());
    this.renderCoordinator.maskPass.renderCircles(this.scene.getCachedObstacleCircles());

    // 4. GPU Pass 3: Two-Tier Hybrid Scatter Filter (Bilateral + Dual Kawase)
    const scatterFbo = this.renderCoordinator.scatterPass.execute(
      this.beamFbo,
      this.maskFbo,
      this.width,
      this.height,
      this.hazeDensity,
      this.bloomIntensity
    );

    // 5. GPU Pass 4: Composite & Extended Reinhard Tonemap Blit
    this.renderCoordinator.compositePass.render(
      null, // Blit directly to screen canvas
      this.beamFbo,
      scatterFbo,
      this.maskFbo,
      this.width,
      this.height,
      this.exposure,
      this.whitePoint,
      this.scatterWeight
    );

    // 6. Temporal Accumulator & Idle Sleep
    this.renderCoordinator.tick(this.beamFbo);

    this.stats.renderTimeMs = performance.now() - t0;
    this.stats.renderState = this.renderCoordinator.getState();
  }

  start(): void {
    if (this.animationFrameId !== null) return;

    const loop = (now: number) => {
      this.frameCount++;
      const delta = now - this.lastFrameTime;
      if (delta >= 1000) {
        this.stats.fps = Math.round((this.frameCount * 1000) / delta);
        this.frameCount = 0;
        this.lastFrameTime = now;
        this.options.onStatsUpdate?.(this.stats);
      }

      if (!this.isPausedFlag || this.scene.isDirty()) {
        this.renderFrame();
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.glManager.deleteFramebuffer(this.beamFbo);
    this.glManager.deleteFramebuffer(this.maskFbo);
    this.renderCoordinator.dispose();
  }
}
