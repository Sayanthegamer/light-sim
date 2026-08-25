<script lang="ts">
  import { onMount } from 'svelte';
  import { OpticsEngine, type EngineStats } from './engine/engine';
  import { EmitterNode } from './engine/scene/emitterNode';
  import { PrismNode } from './engine/scene/prismNode';
  import { LensNode } from './engine/scene/lensNode';
  import { BlackHoleNode } from './engine/scene/blackHoleNode';
  import { BarrierNode } from './engine/scene/barrierNode';
  import { RenderState } from './engine/renderer/renderLoop';
  import { type SceneNode } from './engine/scene/sceneNode';
  import { type GizmoHandle } from './engine/interaction/hitTester';
  import { loadFromCurrentURL, syncToURL } from './engine/state/serializer';
  import { newtonPrismPreset } from './engine/presets/newtonPrism';
  import Dock from './ui/Dock.svelte';
  import Inspector from './ui/Inspector.svelte';
  import GizmoOverlay from './ui/GizmoOverlay.svelte';

  let canvasEl: HTMLCanvasElement;
  let engine = $state<OpticsEngine | null>(null);
  let selectedPresetName = $state<string>("Newton's Prism Dispersion");

  let stats = $state<EngineStats>({
    fps: 60,
    nodeCount: 0,
    vertexCount: 0,
    activeFrustums: 0,
    solveTimeMs: 0,
    renderTimeMs: 0,
    renderState: RenderState.Interacting
  });

  let selectedNode = $state<SceneNode | null>(null);
  let gizmoHandles = $state<GizmoHandle[]>([]);

  function updateSelectedNode() {
    if (!engine) return;
    const node = engine.getGizmoController().getSelectedNode();
    selectedNode = node;
    gizmoHandles = engine.getGizmoController().getGizmoHandles();
  }

  function handleAddNode(type: string) {
    if (!engine) return;
    const scene = engine.getScene();
    const cx = engine.getWidth() * 0.5;
    const cy = engine.getHeight() * 0.5;
    const id = `${type}_${Date.now().toString(36)}`;

    if (type === 'emitter') {
      scene.addNode(new EmitterNode(id, { x: cx - 100, y: cy }, 0));
    } else if (type === 'prism') {
      scene.addNode(new PrismNode(id, { x: cx, y: cy }, 0));
    } else if (type === 'lens') {
      scene.addNode(new LensNode(id, { x: cx, y: cy }, 0));
    } else if (type === 'black_hole') {
      scene.addNode(new BlackHoleNode(id, { x: cx, y: cy }, 0));
    } else if (type === 'barrier') {
      scene.addNode(new BarrierNode(id, { x: cx, y: cy }, 0));
    }

    engine.getGizmoController().selectNode(id);
    engine.commitHistorySnapshot();
    engine.getRenderCoordinator().markDirty(true);
    syncToURL(scene);
    updateSelectedNode();
  }

  function handleDeleteNode(id: string) {
    if (!engine) return;
    engine.getScene().removeNode(id);
    engine.getGizmoController().selectNode(null);
    engine.commitHistorySnapshot();
    engine.getRenderCoordinator().markDirty(true);
    syncToURL(engine.getScene());
    updateSelectedNode();
  }

  function handleResetScene() {
    if (!engine) return;
    engine.loadPreset(newtonPrismPreset);
    selectedPresetName = newtonPrismPreset.name ?? "Newton's Prism Dispersion";
    syncToURL(engine.getScene());
    updateSelectedNode();
  }

  function handleClearScene() {
    if (!engine) return;
    engine.getScene().clear();
    engine.getGizmoController().selectNode(null);
    engine.commitHistorySnapshot();
    engine.getRenderCoordinator().markDirty(true);
    syncToURL(engine.getScene());
    updateSelectedNode();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!engine) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) {
        engine.redo();
      } else {
        engine.undo();
      }
      syncToURL(engine.getScene());
      updateSelectedNode();
      e.preventDefault();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      engine.redo();
      syncToURL(engine.getScene());
      updateSelectedNode();
      e.preventDefault();
    } else if (e.key === ' ') {
      engine.setPaused(!engine.isPaused());
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const active = engine.getGizmoController().getSelectedNode();
      if (active && document.activeElement?.tagName !== 'INPUT') {
        handleDeleteNode(active.id);
        e.preventDefault();
      }
    }
  }

  onMount(() => {
    if (!canvasEl) return;

    const initialEngine = new OpticsEngine(canvasEl, {
      onStatsUpdate: (s) => {
        stats = s;
      },
      onSceneChange: () => {
        updateSelectedNode();
        if (engine) syncToURL(engine.getScene());
      }
    });

    // Check URL hash for shared scene
    const urlScene = loadFromCurrentURL(initialEngine.getScene());
    if (urlScene) {
      initialEngine.getRenderCoordinator().markDirty(true);
      selectedPresetName = 'Custom Shared Scene';
    }

    initialEngine.resize(window.innerWidth, window.innerHeight);
    initialEngine.start();
    engine = initialEngine;
    updateSelectedNode();

    const handleResize = () => {
      if (engine) {
        engine.resize(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      initialEngine.dispose();
    };
  });
</script>

<main class="relative w-screen h-screen bg-matte-950 text-zinc-100 overflow-hidden select-none">
  <!-- WebGL2 Fullscreen Canvas -->
  <canvas
    bind:this={canvasEl}
    class="w-full h-full block cursor-crosshair"
  ></canvas>

  <!-- On-Canvas Vector Gizmo Overlay -->
  <GizmoOverlay
    {selectedNode}
    handles={gizmoHandles}
  />

  <!-- Floating Perimeter Dock Toolbars -->
  <Dock
    {engine}
    {stats}
    bind:selectedPresetName
    onAddNode={handleAddNode}
    onResetScene={handleResetScene}
    onClearScene={handleClearScene}
  />

  <!-- Floating Context-Sensitive Properties Inspector -->
  <Inspector
    node={selectedNode}
    onDelete={handleDeleteNode}
    onChange={() => {
      if (engine) {
        engine.getRenderCoordinator().markDirty(true);
        syncToURL(engine.getScene());
        updateSelectedNode();
      }
    }}
  />
</main>
