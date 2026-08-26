<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Play,
    Pause,
    X,
    Download,
    FileImage,
    Sparkles,
    Cpu
  } from '@lucide/svelte';
  import { SceneGraph } from '../engine/scene/sceneGraph';
  import { freezeSceneSnapshot, type IOfflineRenderJob } from '../engine/offline/sceneSnapshot';
  import { AccumulationTarget } from '../engine/offline/accumulationTarget';
  import { RenderDispatcher } from '../engine/offline/renderDispatcher';
  import { exportHDRBlob, downloadBlob, exportCanvasPNG } from '../engine/offline/hdrExporter';

  let {
    sceneGraph,
    viewportWidth,
    viewportHeight,
    onClose
  }: {
    sceneGraph: SceneGraph;
    viewportWidth: number;
    viewportHeight: number;
    onClose: () => void;
  } = $props();

  let previewCanvas: HTMLCanvasElement;
  let dispatcher = $state<RenderDispatcher | null>(null);
  let target = $state<AccumulationTarget | null>(null);

  // Render State
  const hardwareConcurrency = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  let threadCount = $state<number>(0); // 0 = Auto
  let isPaused = $state(false);
  let isComplete = $state(false);
  let passCount = $state(0);
  let targetPasses = $state(1000);
  let totalPhotons = $state(0);
  let samplesPerSec = $state(0);
  let elapsedMs = $state(0);

  // Post-Processing Sliders
  let exposure = $state(1.0);
  let tonemap = $state<'reinhard' | 'aces' | 'linear'>('reinhard');
  let whitePoint = $state(4.0);

  // Render Resolution (1/2 or 1x)
  let renderWidth = $derived(Math.min(1920, Math.max(640, Math.floor(viewportWidth))));
  let renderHeight = $derived(Math.min(1080, Math.max(480, Math.floor(viewportHeight))));

  let latestBuffer: Float32Array | null = null;

  function updatePreview() {
    if (!previewCanvas || !latestBuffer || !target) return;
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(renderWidth, renderHeight);
    target.buffer.set(latestBuffer);
    target.resolveToImageData(imgData.data, { exposure, tonemap, whitePoint });
    ctx.putImageData(imgData, 0, 0);
  }

  function startRender() {
    if (!sceneGraph) return;

    target = new AccumulationTarget(renderWidth, renderHeight);
    dispatcher = new RenderDispatcher();

    const activeThreads = threadCount === 0 ? hardwareConcurrency : threadCount;
    const job: IOfflineRenderJob = freezeSceneSnapshot(sceneGraph, renderWidth, renderHeight, {
      targetSamples: targetPasses,
      batchPhotons: 25000,
      volumetricInScatter: true,
      threadCount: activeThreads
    });

    isPaused = false;
    isComplete = false;
    passCount = 0;
    totalPhotons = 0;

    dispatcher.start(
      job,
      (progress) => {
        passCount = progress.pass;
        totalPhotons = progress.totalPhotons;
        samplesPerSec = progress.samplesPerSec;
        elapsedMs = progress.elapsedMs;
        latestBuffer = progress.buffer;
        updatePreview();
      },
      (buffer, _sampleCountMap, finalElapsedMs) => {
        isComplete = true;
        elapsedMs = finalElapsedMs;
        latestBuffer = buffer;
        updatePreview();
      }
    );
  }

  function restartRender() {
    dispatcher?.cancel();
    startRender();
  }

  function togglePause() {
    if (!dispatcher) return;
    if (isPaused) {
      dispatcher.resume();
      isPaused = false;
    } else {
      dispatcher.pause();
      isPaused = true;
    }
  }

  function handleExportHDR() {
    if (!latestBuffer) return;
    const blob = exportHDRBlob(latestBuffer, renderWidth, renderHeight, exposure);
    downloadBlob(blob, `render_${Date.now()}.hdr`);
  }

  function handleExportPNG() {
    if (!previewCanvas) return;
    exportCanvasPNG(previewCanvas, `render_${Date.now()}.png`);
  }

  onMount(() => {
    startRender();
  });

  onDestroy(() => {
    dispatcher?.cancel();
  });

  $effect(() => {
    // Re-resolve preview whenever post-processing sliders change
    if (exposure || tonemap || whitePoint) {
      updatePreview();
    }
  });
</script>

<div class="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
  <div class="bg-matte-900 border border-matte-800 rounded-xl shadow-2xl flex flex-col w-full max-w-5xl max-h-[92vh] overflow-hidden text-zinc-200">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3 border-b border-matte-800 bg-matte-950/60">
      <div class="flex items-center gap-2.5">
        <Sparkles class="w-4 h-4 text-amber-400" />
        <span class="text-sm font-semibold tracking-wide text-zinc-100 uppercase">Cycles Production Renderer</span>
        <span class="text-xs text-zinc-500 font-mono">({renderWidth} × {renderHeight})</span>
      </div>

      <button
        type="button"
        onclick={onClose}
        class="p-1 text-zinc-400 hover:text-white hover:bg-matte-800 rounded-lg transition-colors"
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Main Viewport Preview Area -->
    <div class="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[380px] p-2">
      <canvas
        bind:this={previewCanvas}
        width={renderWidth}
        height={renderHeight}
        class="max-w-full max-h-[55vh] object-contain border border-matte-800/60 rounded shadow-inner"
      ></canvas>

      {#if passCount === 0 && !isComplete}
        <div class="absolute inset-0 flex items-center justify-center bg-black/50 text-zinc-400 gap-2 text-xs font-mono">
          <Cpu class="w-4 h-4 animate-spin text-amber-400" />
          <span>Initializing Monte Carlo Integrator Kernel...</span>
        </div>
      {/if}
    </div>

    <!-- Progress & Stats Bar -->
    <div class="px-5 py-2.5 bg-matte-950 border-t border-b border-matte-800 flex items-center justify-between text-xs font-mono text-zinc-400">
      <div class="flex items-center gap-3">
        <span class="text-zinc-200 font-semibold">
          Pass {passCount} / {targetPasses}
        </span>
        <div class="w-32 h-1.5 bg-matte-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-150"
            style="width: {Math.min(100, (passCount / targetPasses) * 100)}%"
          ></div>
        </div>
        <span class="text-zinc-500">{((passCount / targetPasses) * 100).toFixed(1)}%</span>
      </div>

      <div class="flex items-center gap-4 text-[11px]">
        <div class="flex items-center gap-1.5 text-zinc-300">
          <Cpu class="w-3 h-3 text-amber-400" />
          <span>{dispatcher?.getWorkerCount() || (threadCount === 0 ? hardwareConcurrency : threadCount)} Threads</span>
        </div>
        <span class="text-zinc-700">|</span>
        <span>{(totalPhotons / 1e6).toFixed(2)}M Photons</span>
        <span class="text-zinc-700">|</span>
        <span>{(samplesPerSec / 1000).toFixed(1)}k samp/s</span>
        <span class="text-zinc-700">|</span>
        <span>{(elapsedMs / 1000).toFixed(1)}s</span>
      </div>
    </div>

    <!-- Controls & Actions Toolbar -->
    <div class="px-5 py-3 bg-matte-900 flex items-center justify-between gap-4">
      <!-- Left: Pause / Resume -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          disabled={isComplete}
          onclick={togglePause}
          class="flex items-center gap-1.5 text-xs font-medium text-zinc-100 bg-matte-850 hover:bg-matte-800 disabled:opacity-50 border border-matte-800 px-3 py-1.5 rounded transition-colors"
        >
          {#if isPaused}
            <Play class="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
            <span>Resume</span>
          {:else}
            <Pause class="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>Pause</span>
          {/if}
        </button>

        <div class="flex items-center gap-1.5 text-xs font-mono ml-2">
          <span class="text-zinc-400">Threads:</span>
          <select
            bind:value={threadCount}
            onchange={restartRender}
            class="bg-matte-850 border border-matte-800 text-zinc-200 text-xs rounded px-2 py-1 outline-none font-mono cursor-pointer"
          >
            <option value={0}>Auto ({hardwareConcurrency}T)</option>
            <option value={1}>1 Thread</option>
            <option value={2}>2 Threads</option>
            <option value={4}>4 Threads</option>
            <option value={8}>8 Threads</option>
            <option value={16}>16 Threads</option>
            <option value={32}>32 Threads</option>
          </select>
        </div>
      </div>

      <!-- Center: Real-time Tonemap & Exposure -->
      <div class="flex items-center gap-5 text-xs font-mono">
        <div class="flex items-center gap-2">
          <span class="text-zinc-400">Exposure:</span>
          <input
            type="range"
            min="0.1"
            max="4.0"
            step="0.05"
            bind:value={exposure}
            class="w-20 h-1 bg-matte-800 rounded appearance-none accent-amber-400 cursor-pointer"
          />
          <span class="w-8 text-right text-zinc-200">{exposure.toFixed(2)}</span>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-zinc-400">Tonemap:</span>
          <select
            bind:value={tonemap}
            class="bg-matte-850 border border-matte-800 text-zinc-200 text-xs rounded px-2 py-1 outline-none"
          >
            <option value="reinhard">Reinhard</option>
            <option value="aces">ACES</option>
            <option value="linear">Linear</option>
          </select>
        </div>
      </div>

      <!-- Right: Export Buttons -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          disabled={passCount === 0}
          onclick={handleExportHDR}
          class="flex items-center gap-1.5 text-xs font-medium text-zinc-200 bg-matte-850 hover:bg-matte-800 disabled:opacity-40 border border-matte-800 px-3 py-1.5 rounded transition-colors"
        >
          <Download class="w-3.5 h-3.5 text-cyan-400" />
          <span>Export 32-Bit HDR</span>
        </button>

        <button
          type="button"
          disabled={passCount === 0}
          onclick={handleExportPNG}
          class="flex items-center gap-1.5 text-xs font-medium text-zinc-100 bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 border border-emerald-600/50 px-3 py-1.5 rounded transition-colors shadow-lg"
        >
          <FileImage class="w-3.5 h-3.5 text-white" />
          <span>Export PNG</span>
        </button>
      </div>
    </div>
  </div>
</div>
