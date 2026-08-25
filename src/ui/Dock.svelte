<script lang="ts">
  import {
    Play,
    Pause,
    RotateCcw,
    Undo2,
    Redo2,
    Plus,
    Share2,
    Sun,
    Trash2
  } from '@lucide/svelte';
  import { ALL_PRESETS } from '../engine/presets';
  import type { OpticsEngine, EngineStats } from '../engine/engine';

  let {
    engine,
    stats,
    selectedPresetName = $bindable(),
    onAddNode,
    onResetScene,
    onClearScene
  }: {
    engine: OpticsEngine | null;
    stats: EngineStats;
    selectedPresetName: string;
    onAddNode: (type: string) => void;
    onResetScene: () => void;
    onClearScene: () => void;
  } = $props();

  let showAddMenu = $state(false);
  let showPresetsMenu = $state(false);
  let copyFeedback = $state(false);

  function togglePlayPause() {
    if (!engine) return;
    engine.setPaused(!engine.isPaused());
  }

  function handleUndo() {
    if (!engine) return;
    engine.undo();
  }

  function handleRedo() {
    if (!engine) return;
    engine.redo();
  }

  function handleSelectPreset(preset: typeof ALL_PRESETS[0]) {
    if (!engine) return;
    selectedPresetName = preset.name ?? 'Preset';
    engine.loadPreset(preset);
    showPresetsMenu = false;
  }

  async function handleShare() {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      copyFeedback = true;
      setTimeout(() => (copyFeedback = false), 2000);
    } catch {
      // Fallback
    }
  }
</script>

<!-- Top Perimeter Toolbar -->
<header class="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20">
  <!-- Left: Brand & Preset Selector -->
  <div class="flex items-center gap-2 pointer-events-auto bg-matte-900 border border-matte-800 rounded-lg px-3 py-1.5 shadow-2xl">
    <div class="flex items-center gap-2 pr-3 border-r border-matte-800">
      <Sun class="w-4 h-4 text-amber-400" />
      <span class="text-xs font-semibold tracking-wider text-zinc-100 uppercase">Volumetric Optics</span>
    </div>

    <!-- Preset Selector -->
    <div class="relative">
      <button
        type="button"
        onclick={() => (showPresetsMenu = !showPresetsMenu)}
        class="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white bg-matte-850 hover:bg-matte-800 border border-matte-800 px-2.5 py-1 rounded transition-colors"
      >
        <span class="font-medium">{selectedPresetName || 'Presets'}</span>
        <span class="text-[10px] text-zinc-500">▼</span>
      </button>

      {#if showPresetsMenu}
        <div class="absolute top-full left-0 mt-1.5 w-64 bg-matte-900 border border-matte-800 rounded-lg shadow-2xl p-1 z-30 flex flex-col gap-0.5">
          {#each ALL_PRESETS as preset}
            <button
              type="button"
              onclick={() => handleSelectPreset(preset)}
              class="text-left px-2.5 py-1.5 rounded hover:bg-matte-800 text-xs text-zinc-200 transition-colors flex flex-col"
            >
              <span class="font-medium text-zinc-100">{preset.name}</span>
              <span class="text-[10px] text-zinc-400 line-clamp-1">{preset.description}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Right: Add Objects, Share & Clear -->
  <div class="flex items-center gap-2 pointer-events-auto bg-matte-900 border border-matte-800 rounded-lg px-2 py-1.5 shadow-2xl">
    <!-- Add Object Dropdown -->
    <div class="relative">
      <button
        type="button"
        onclick={() => (showAddMenu = !showAddMenu)}
        class="flex items-center gap-1 text-xs text-zinc-200 bg-matte-850 hover:bg-matte-800 border border-matte-800 px-2.5 py-1 rounded transition-colors"
      >
        <Plus class="w-3.5 h-3.5 text-emerald-400" />
        <span>Add Object</span>
      </button>

      {#if showAddMenu}
        <div class="absolute top-full right-0 mt-1.5 w-44 bg-matte-900 border border-matte-800 rounded-lg shadow-2xl p-1 z-30 flex flex-col gap-0.5">
          <button
            type="button"
            onclick={() => { onAddNode('emitter'); showAddMenu = false; }}
            class="text-left px-2.5 py-1.5 rounded hover:bg-matte-800 text-xs text-zinc-200"
          >
            Light Emitter
          </button>
          <button
            type="button"
            onclick={() => { onAddNode('prism'); showAddMenu = false; }}
            class="text-left px-2.5 py-1.5 rounded hover:bg-matte-800 text-xs text-zinc-200"
          >
            Dispersive Prism
          </button>
          <button
            type="button"
            onclick={() => { onAddNode('lens'); showAddMenu = false; }}
            class="text-left px-2.5 py-1.5 rounded hover:bg-matte-800 text-xs text-zinc-200"
          >
            Spherical Lens
          </button>
          <button
            type="button"
            onclick={() => { onAddNode('black_hole'); showAddMenu = false; }}
            class="text-left px-2.5 py-1.5 rounded hover:bg-matte-800 text-xs text-zinc-200"
          >
            Schwarzschild Black Hole
          </button>
          <button
            type="button"
            onclick={() => { onAddNode('barrier'); showAddMenu = false; }}
            class="text-left px-2.5 py-1.5 rounded hover:bg-matte-800 text-xs text-zinc-200"
          >
            Mirror / Barrier
          </button>
        </div>
      {/if}
    </div>

    <!-- Share Link -->
    <button
      type="button"
      title="Copy shareable URL hash"
      onclick={handleShare}
      class="flex items-center gap-1 text-xs text-zinc-300 hover:text-white bg-matte-850 hover:bg-matte-800 border border-matte-800 px-2 py-1 rounded transition-colors"
    >
      <Share2 class="w-3.5 h-3.5" />
      <span>{copyFeedback ? 'Copied!' : 'Share'}</span>
    </button>

    <!-- Reset -->
    <button
      type="button"
      title="Reset current preset"
      onclick={onResetScene}
      class="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-matte-800 rounded transition-colors"
    >
      <RotateCcw class="w-3.5 h-3.5" />
    </button>

    <!-- Clear -->
    <button
      type="button"
      title="Clear all objects"
      onclick={onClearScene}
      class="p-1 text-zinc-400 hover:text-rose-400 hover:bg-matte-800 rounded transition-colors"
    >
      <Trash2 class="w-3.5 h-3.5" />
    </button>
  </div>
</header>

<!-- Bottom Perimeter Toolbar -->
<footer class="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20">
  <!-- Left: Transport Controls (Play/Pause, Undo/Redo) -->
  <div class="flex items-center gap-2 pointer-events-auto bg-matte-900 border border-matte-800 rounded-lg px-2 py-1.5 shadow-2xl">
    <button
      type="button"
      title={engine?.isPaused() ? 'Unfreeze light beam (Space)' : 'Freeze light beam (Space)'}
      onclick={togglePlayPause}
      class="flex items-center gap-1.5 text-xs font-medium text-zinc-100 bg-matte-850 hover:bg-matte-800 border border-matte-800 px-2.5 py-1 rounded transition-colors"
    >
      {#if engine?.isPaused()}
        <Play class="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
        <span>Resume</span>
      {:else}
        <Pause class="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
        <span>Freeze</span>
      {/if}
    </button>

    <div class="h-4 w-px bg-matte-800"></div>

    <button
      type="button"
      title="Undo (Ctrl+Z)"
      disabled={!engine?.canUndo()}
      onclick={handleUndo}
      class="p-1 text-zinc-300 hover:text-white disabled:text-zinc-600 hover:bg-matte-800 disabled:hover:bg-transparent rounded transition-colors"
    >
      <Undo2 class="w-3.5 h-3.5" />
    </button>

    <button
      type="button"
      title="Redo (Ctrl+Y)"
      disabled={!engine?.canRedo()}
      onclick={handleRedo}
      class="p-1 text-zinc-300 hover:text-white disabled:text-zinc-600 hover:bg-matte-800 disabled:hover:bg-transparent rounded transition-colors"
    >
      <Redo2 class="w-3.5 h-3.5" />
    </button>
  </div>

  <!-- Center: Optical Environment Sliders -->
  {#if engine}
    <div class="flex items-center gap-4 pointer-events-auto bg-matte-900 border border-matte-800 rounded-lg px-3 py-1.5 shadow-2xl text-[11px] font-mono text-zinc-300">
      <div class="flex items-center gap-1.5">
        <span class="text-zinc-400">Haze:</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={engine.hazeDensity}
          class="w-16 h-1 bg-matte-800 rounded appearance-none accent-indigo-400 cursor-pointer"
        />
        <span class="w-7 text-right">{engine.hazeDensity.toFixed(2)}</span>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="text-zinc-400">Bloom:</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={engine.bloomIntensity}
          class="w-16 h-1 bg-matte-800 rounded appearance-none accent-amber-400 cursor-pointer"
        />
        <span class="w-7 text-right">{engine.bloomIntensity.toFixed(2)}</span>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="text-zinc-400">Exp:</span>
        <input
          type="range"
          min="0.2"
          max="3.0"
          step="0.1"
          bind:value={engine.exposure}
          class="w-16 h-1 bg-matte-800 rounded appearance-none accent-cyan-400 cursor-pointer"
        />
        <span class="w-7 text-right">{engine.exposure.toFixed(1)}</span>
      </div>
    </div>
  {/if}

  <!-- Right: Real-Time Performance & Solver Telemetry -->
  <div class="flex items-center gap-3 pointer-events-auto bg-matte-900 border border-matte-800 rounded-lg px-3 py-1.5 shadow-2xl text-[11px] font-mono text-zinc-400">
    <div class="flex items-center gap-1">
      <span class="w-2 h-2 rounded-full {stats.renderState === 'SLEEPING' ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse"></span>
      <span class="text-zinc-200 font-semibold">{stats.fps} FPS</span>
    </div>
    <span class="text-zinc-600">|</span>
    <span>{stats.activeFrustums} beams</span>
    <span class="text-zinc-600">|</span>
    <span>{stats.vertexCount} verts</span>
    <span class="text-zinc-600">|</span>
    <span class="text-[10px] uppercase text-zinc-500">{stats.renderState}</span>
  </div>
</footer>
