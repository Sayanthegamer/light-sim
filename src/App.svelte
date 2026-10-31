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
  import { HandleType, type GizmoHandle } from './engine/interaction/hitTester';
  import { loadFromCurrentURL, syncToURL } from './engine/state/serializer';
  import { newtonPrismPreset } from './engine/presets/newtonPrism';
  import Dock from './ui/Dock.svelte';
  import Inspector from './ui/Inspector.svelte';
  import GizmoOverlay from './ui/GizmoOverlay.svelte';
  import RenderModal from './ui/RenderModal.svelte';

  let canvasEl: HTMLCanvasElement;
  let engine = $state<OpticsEngine | null>(null);
  let selectedPresetName = $state<string>("Newton's Prism Dispersion");
  let showRenderModal = $state(false);
  let showOutlines = $state(true);
  let showGrid = $state(false);
  let canvasCursor = $state('crosshair');
  let sceneVersion = $state(0);

  let stats = $state<EngineStats>({
    fps: 60,
    nodeCount: 0,
    vertexCount: 0,
    activeFrustums: 0,
    solveTimeMs: 0,
    renderTimeMs: 0,
    renderState: RenderState.Interacting
  });

  let sceneNodes = $state<SceneNode[]>([]);
  let selectedNode = $state<SceneNode | null>(null);
  let hoveredNode = $state<SceneNode | null>(null);
  let hoveredHandle = $state<HandleType | null>(null);
  let gizmoHandles = $state<GizmoHandle[]>([]);

  function updateSelectedNode() {
    if (!engine) return;
    const gc = engine.getGizmoController();
    sceneNodes = [...engine.getScene().getAllNodes()];
    selectedNode = gc.getSelectedNode();
    hoveredNode = gc.getHoveredNode();
    hoveredHandle = gc.getHoveredHandle();
    canvasCursor = gc.getCursor();
    gizmoHandles = gc.getGizmoHandles();
    sceneVersion++;
  }

  function handleSelectNode(id: string) {
    if (!engine) return;
    engine.getGizmoController().selectNode(id);
    updateSelectedNode();
  }

  function handleAddNode(type: string) {
    if (!engine) return;
    const scene = engine.getScene();
    let cx = Math.round(engine.getWidth() * 0.5);
    let cy = Math.round(engine.getHeight() * 0.5);
    const id = `${type}_${Date.now().toString(36)}`;

    let spawnX = type === 'emitter' ? cx - 140 : cx;
    let spawnY = cy;

    // Offset slightly if another object already occupies the exact spawn point
    const existing = scene.getAllNodes();
    for (let attempt = 0; attempt < 8; attempt++) {
      const collision = existing.some(
        n => Math.hypot(n.position.x - spawnX, n.position.y - spawnY) < 42
      );
      if (!collision) break;
      spawnX += 36;
      spawnY += (attempt % 2 === 0 ? 28 : -28);
    }

    if (type === 'emitter') {
      scene.addNode(new EmitterNode(id, { x: spawnX, y: spawnY }, 0));
    } else if (type === 'prism') {
      scene.addNode(new PrismNode(id, { x: spawnX, y: spawnY }, 0));
    } else if (type === 'lens') {
      scene.addNode(new LensNode(id, { x: spawnX, y: spawnY }, 0));
    } else if (type === 'black_hole') {
      scene.addNode(new BlackHoleNode(id, { x: spawnX, y: spawnY }, 0));
    } else if (type === 'barrier') {
      scene.addNode(new BarrierNode(id, { x: spawnX, y: spawnY }, 0));
    }

    engine.getGizmoController().selectNode(id);
    engine.commitHistorySnapshot();
    engine.getRenderCoordinator().markDirty(false);
    syncToURL(scene);
    updateSelectedNode();
  }

  function handleDeleteNode(id: string) {
    if (!engine) return;
    engine.getScene().removeNode(id);
    engine.getGizmoController().selectNode(null);
    engine.commitHistorySnapshot();
    engine.getRenderCoordinator().markDirty(false);
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
    engine.getRenderCoordinator().markDirty(false);
    syncToURL(engine.getScene());
    updateSelectedNode();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!engine) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

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
    } else if (e.key.toLowerCase() === 'o') {
      showOutlines = !showOutlines;
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'g') {
      showGrid = !showGrid;
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const active = engine.getGizmoController().getSelectedNode();
      if (active) {
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
      },
      onHoverChange: () => {
        updateSelectedNode();
      }
    });

    // Check URL hash for shared scene
    const urlScene = loadFromCurrentURL(initialEngine.getScene());
    if (urlScene) {
      initialEngine.getRenderCoordinator().markDirty(false);
      selectedPresetName = 'Custom Shared Scene';
    }

    initialEngine.resize(window.innerWidth, window.innerHeight);
    initialEngine.start();
    engine = initialEngine;
    updateSelectedNode();

    const handleResize = () => {
      if (engine) {
        const w = canvasEl?.clientWidth || window.innerWidth;
        const h = canvasEl?.clientHeight || window.innerHeight;
        engine.resize(w, h);
        updateSelectedNode();
      }
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(canvasEl);
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      resizeObserver?.disconnect();
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
    style="cursor: {canvasCursor};"
    class="w-full h-full block"
  ></canvas>

  <!-- On-Canvas Vector Gizmo & Element Outline Overlay -->
  <GizmoOverlay
    nodes={sceneNodes}
    {selectedNode}
    {hoveredNode}
    handles={gizmoHandles}
    {hoveredHandle}
    {showOutlines}
    {showGrid}
    {sceneVersion}
  />

  <!-- Floating Perimeter Dock Toolbars -->
  <Dock
    {engine}
    {stats}
    nodes={sceneNodes}
    {selectedNode}
    bind:selectedPresetName
    bind:showOutlines
    bind:showGrid
    onAddNode={handleAddNode}
    onSelectNode={handleSelectNode}
    onResetScene={handleResetScene}
    onClearScene={handleClearScene}
    onOpenRenderModal={() => (showRenderModal = true)}
  />

  <!-- Floating Context-Sensitive Properties Inspector -->
  <Inspector
    node={selectedNode}
    {sceneVersion}
    onDelete={handleDeleteNode}
    onChange={() => {
      if (engine) {
        engine.getRenderCoordinator().markDirty(false);
        syncToURL(engine.getScene());
        updateSelectedNode();
      }
    }}
  />

  <!-- Production Offline Render Modal -->
  {#if showRenderModal && engine}
    <RenderModal
      sceneGraph={engine.getScene()}
      viewportWidth={engine.getWidth()}
      viewportHeight={engine.getHeight()}
      onClose={() => (showRenderModal = false)}
    />
  {/if}
</main>
