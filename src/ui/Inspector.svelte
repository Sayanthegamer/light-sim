<script lang="ts">
  import { Trash2, Sun, Disc, CircleDot, Shield, Layers } from '@lucide/svelte';
  import { SceneNode } from '../engine/scene/sceneNode';
  import { EmitterNode } from '../engine/scene/emitterNode';
  import { PrismNode } from '../engine/scene/prismNode';
  import { LensNode, LensType } from '../engine/scene/lensNode';
  import { BlackHoleNode } from '../engine/scene/blackHoleNode';
  import { BarrierNode } from '../engine/scene/barrierNode';
  import { wavelengthToLinearRGB, linearToSRGBGamma } from '../engine/optics/cie1931';

  let {
    node,
    onDelete,
    onChange
  }: {
    node: SceneNode | null;
    onDelete: (id: string) => void;
    onChange: () => void;
  } = $props();

  let emitter = $derived(node?.type === 'emitter' ? (node as EmitterNode) : null);
  let prism = $derived(node?.type === 'prism' ? (node as PrismNode) : null);
  let lens = $derived(node?.type === 'lens' ? (node as LensNode) : null);
  let blackHole = $derived(node?.type === 'black_hole' ? (node as BlackHoleNode) : null);
  let barrier = $derived(node?.type === 'barrier' ? (node as BarrierNode) : null);

  let spectralColorCss = $derived.by(() => {
    if (!emitter || emitter.isWhiteLight) return '#ffffff';
    const rgb = wavelengthToLinearRGB(emitter.wavelength);
    const r = Math.round(linearToSRGBGamma(rgb.r) * 255);
    const g = Math.round(linearToSRGBGamma(rgb.g) * 255);
    const b = Math.round(linearToSRGBGamma(rgb.b) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  });

  function getRotationDegrees(rad: number): number {
    let deg = Math.round((rad * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    return deg;
  }

  function setRotationDegrees(deg: number) {
    if (!node) return;
    node.setRotation((deg * Math.PI) / 180);
    onChange();
  }
</script>

{#if node}
  <aside class="absolute top-14 right-3 w-72 bg-matte-900 border border-matte-800 rounded-lg p-3 shadow-2xl z-20 flex flex-col gap-3 text-xs text-zinc-200">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-matte-800">
      <div class="flex items-center gap-2">
        {#if node.type === 'emitter'}
          <Sun class="w-4 h-4 text-amber-400" />
        {:else if node.type === 'prism'}
          <Layers class="w-4 h-4 text-cyan-400" />
        {:else if node.type === 'lens'}
          <Disc class="w-4 h-4 text-indigo-400" />
        {:else if node.type === 'black_hole'}
          <CircleDot class="w-4 h-4 text-purple-400" />
        {:else if node.type === 'barrier'}
          <Shield class="w-4 h-4 text-emerald-400" />
        {/if}
        <span class="font-semibold text-zinc-100 uppercase tracking-wider text-[11px]">{node.type.replace('_', ' ')}</span>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="text-[10px] font-mono text-zinc-400 bg-matte-850 px-1.5 py-0.5 rounded">{node.id}</span>
        <button
          type="button"
          title="Delete selected element"
          onclick={() => onDelete(node.id)}
          class="p-1 text-zinc-400 hover:text-rose-400 hover:bg-matte-800 rounded transition-colors"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Transform Parameters -->
    <div class="flex flex-col gap-2">
      <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Transform</span>

      <div class="grid grid-cols-2 gap-2">
        <label class="flex items-center justify-between bg-matte-850 border border-matte-800 px-2 py-1 rounded">
          <span class="text-zinc-400">X:</span>
          <input
            type="number"
            bind:value={node.position.x}
            oninput={() => { node.markDirty(); onChange(); }}
            class="w-14 bg-transparent text-right font-mono text-zinc-100 focus:outline-none"
          />
        </label>

        <label class="flex items-center justify-between bg-matte-850 border border-matte-800 px-2 py-1 rounded">
          <span class="text-zinc-400">Y:</span>
          <input
            type="number"
            bind:value={node.position.y}
            oninput={() => { node.markDirty(); onChange(); }}
            class="w-14 bg-transparent text-right font-mono text-zinc-100 focus:outline-none"
          />
        </label>
      </div>

      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-zinc-400">Rotation:</span>
          <span class="font-mono">{getRotationDegrees(node.rotation)}°</span>
        </div>
        <input
          type="range"
          min="0"
          max="360"
          value={getRotationDegrees(node.rotation)}
          oninput={(e) => setRotationDegrees(Number((e.target as HTMLInputElement).value))}
          class="w-full h-1 bg-matte-800 rounded appearance-none accent-amber-400 cursor-pointer"
        />
      </div>
    </div>

    <!-- Entity Specific Parameters -->
    {#if emitter}
      <div class="flex flex-col gap-2 pt-2 border-t border-matte-800">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Light Emission</span>

        <!-- Wavelength & Spectrum -->
        <label class="flex items-center justify-between cursor-pointer">
          <span class="text-zinc-300">White Continuous Light</span>
          <input
            type="checkbox"
            checked={emitter.isWhiteLight}
            onchange={(e) => {
              emitter.setIsWhiteLight((e.target as HTMLInputElement).checked);
              onChange();
            }}
            class="accent-amber-400 rounded cursor-pointer"
          />
        </label>

        {#if !emitter.isWhiteLight}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-zinc-400">Wavelength λ:</span>
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-full border border-white/20" style="background-color: {spectralColorCss}"></div>
                <span class="font-mono">{emitter.wavelength} nm</span>
              </div>
            </div>
            <input
              type="range"
              min="380"
              max="780"
              step="1"
              value={emitter.wavelength}
              oninput={(e) => {
                emitter.setWavelength(Number((e.target as HTMLInputElement).value));
                onChange();
              }}
              class="w-full h-1 bg-gradient-to-r from-violet-600 via-emerald-400 to-red-600 rounded appearance-none cursor-pointer"
            />
          </div>
        {/if}

        <!-- Aperture Width -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-zinc-400">Aperture Width:</span>
            <span class="font-mono">{Math.round(emitter.beamWidth)} px</span>
          </div>
          <input
            type="range"
            min="10"
            max="160"
            step="2"
            value={emitter.beamWidth}
            oninput={(e) => {
              emitter.setBeamWidth(Number((e.target as HTMLInputElement).value));
              onChange();
            }}
            class="w-full h-1 bg-matte-800 rounded appearance-none accent-indigo-400 cursor-pointer"
          />
        </div>

        <!-- Radiant Intensity -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-zinc-400">Intensity (Power):</span>
            <span class="font-mono">{emitter.intensity.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="3.0"
            step="0.1"
            value={emitter.intensity}
            oninput={(e) => {
              emitter.setIntensity(Number((e.target as HTMLInputElement).value));
              onChange();
            }}
            class="w-full h-1 bg-matte-800 rounded appearance-none accent-amber-400 cursor-pointer"
          />
        </div>
      </div>
    {:else if prism}
      <div class="flex flex-col gap-2 pt-2 border-t border-matte-800">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Prism Optics</span>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-zinc-400">Refractive Index n:</span>
            <span class="font-mono">{prism.refractiveIndex.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min="1.1"
            max="2.4"
            step="0.005"
            value={prism.refractiveIndex}
            oninput={(e) => {
              prism.setRefractiveIndex(Number((e.target as HTMLInputElement).value));
              onChange();
            }}
            class="w-full h-1 bg-matte-800 rounded appearance-none accent-cyan-400 cursor-pointer"
          />
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-zinc-400">Cauchy B (Dispersion):</span>
            <span class="font-mono">{prism.cauchyB.toFixed(4)}</span>
          </div>
          <input
            type="range"
            min="0.0"
            max="0.015"
            step="0.0005"
            value={prism.cauchyB}
            oninput={(e) => {
              prism.setCauchy(prism.cauchyA, Number((e.target as HTMLInputElement).value));
              onChange();
            }}
            class="w-full h-1 bg-matte-800 rounded appearance-none accent-cyan-400 cursor-pointer"
          />
        </div>
      </div>
    {:else if lens}
      <div class="flex flex-col gap-2 pt-2 border-t border-matte-800">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Lens Profile</span>

        <div class="flex items-center justify-between">
          <span class="text-zinc-400">Lens Type:</span>
          <select
            bind:value={lens.lensType}
            onchange={() => { lens.markDirty(); onChange(); }}
            class="bg-matte-850 border border-matte-800 px-2 py-0.5 rounded text-xs text-zinc-200 focus:outline-none"
          >
            <option value={LensType.Biconvex}>Biconvex</option>
            <option value={LensType.Biconcave}>Biconcave</option>
            <option value={LensType.Planoconvex}>Planoconvex</option>
            <option value={LensType.Planoconcave}>Planoconcave</option>
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-zinc-400">Curvature Radius:</span>
            <span class="font-mono">{Math.round(lens.radius1)} px</span>
          </div>
          <input
            type="range"
            min="40"
            max="250"
            step="5"
            value={lens.radius1}
            oninput={(e) => {
              const r = Number((e.target as HTMLInputElement).value);
              lens.setCurvature(r, r);
              onChange();
            }}
            class="w-full h-1 bg-matte-800 rounded appearance-none accent-indigo-400 cursor-pointer"
          />
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-zinc-400">Refractive Index n:</span>
            <span class="font-mono">{lens.refractiveIndex.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min="1.1"
            max="2.2"
            step="0.01"
            value={lens.refractiveIndex}
            oninput={(e) => {
              lens.setRefractiveIndex(Number((e.target as HTMLInputElement).value));
              onChange();
            }}
            class="w-full h-1 bg-matte-800 rounded appearance-none accent-indigo-400 cursor-pointer"
          />
        </div>
      </div>
    {:else if blackHole}
      <div class="flex flex-col gap-2 pt-2 border-t border-matte-800">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">General Relativity</span>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-zinc-400">Schwarzschild Radius rs:</span>
            <span class="font-mono">{Math.round(blackHole.rs)} px</span>
          </div>
          <input
            type="range"
            min="8"
            max="60"
            step="1"
            value={blackHole.rs}
            oninput={(e) => {
              blackHole.setRs(Number((e.target as HTMLInputElement).value));
              onChange();
            }}
            class="w-full h-1 bg-matte-800 rounded appearance-none accent-purple-400 cursor-pointer"
          />
        </div>

        <div class="flex items-center justify-between text-[11px] bg-matte-850 p-2 rounded border border-matte-800">
          <span class="text-zinc-400">Influence Zone (12 rs):</span>
          <span class="font-mono text-purple-300">{Math.round(blackHole.rInfluence)} px</span>
        </div>
      </div>
    {:else if barrier}
      <div class="flex flex-col gap-2 pt-2 border-t border-matte-800">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Obstacle Properties</span>

        <label class="flex items-center justify-between cursor-pointer">
          <span class="text-zinc-300">Reflective Mirror</span>
          <input
            type="checkbox"
            checked={barrier.isMirror}
            onchange={(e) => {
              barrier.setIsMirror((e.target as HTMLInputElement).checked);
              onChange();
            }}
            class="accent-emerald-400 rounded cursor-pointer"
          />
        </label>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-zinc-400">Length:</span>
            <span class="font-mono">{Math.round(barrier.length)} px</span>
          </div>
          <input
            type="range"
            min="30"
            max="300"
            step="5"
            value={barrier.length}
            oninput={(e) => {
              barrier.setDimensions(Number((e.target as HTMLInputElement).value), barrier.thickness);
              onChange();
            }}
            class="w-full h-1 bg-matte-800 rounded appearance-none accent-emerald-400 cursor-pointer"
          />
        </div>
      </div>
    {/if}
  </aside>
{/if}
