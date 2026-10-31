<script lang="ts">
  import { SceneNode } from '../engine/scene/sceneNode';
  import { EmitterNode } from '../engine/scene/emitterNode';
  import { PrismNode } from '../engine/scene/prismNode';
  import { LensNode } from '../engine/scene/lensNode';
  import { BarrierNode } from '../engine/scene/barrierNode';
  import { BlackHoleNode } from '../engine/scene/blackHoleNode';
  import { HandleType, type GizmoHandle } from '../engine/interaction/hitTester';
  import { wavelengthToLinearRGB, linearToSRGBGamma } from '../engine/optics/cie1931';

  let {
    nodes = [],
    selectedNode = null,
    hoveredNode = null,
    handles = [],
    hoveredHandle = null,
    showOutlines = true,
    showGrid = false,
    sceneVersion = 0
  }: {
    nodes?: SceneNode[];
    selectedNode: SceneNode | null;
    hoveredNode?: SceneNode | null;
    handles?: GizmoHandle[];
    hoveredHandle?: HandleType | null;
    showOutlines?: boolean;
    showGrid?: boolean;
    sceneVersion?: number;
  } = $props();

  let rotHandle = $derived.by(() => {
    void sceneVersion;
    return handles.find(h => h.type === HandleType.Rotate);
  });

  let resizeHandles = $derived.by(() => {
    void sceneVersion;
    return handles.filter(h => h.type === HandleType.ResizePrimary || h.type === HandleType.ResizeSecondary);
  });

  function polyToPoints(pts: { x: number; y: number }[]): string {
    return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  function getEmitterColor(em: EmitterNode): string {
    if (em.isWhiteLight) return '#fef08a';
    const rgb = wavelengthToLinearRGB(em.wavelength);
    const r = Math.round(linearToSRGBGamma(rgb.r) * 255);
    const g = Math.round(linearToSRGBGamma(rgb.g) * 255);
    const b = Math.round(linearToSRGBGamma(rgb.b) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function getNodeLabel(node: SceneNode): string {
    if (node.type === 'emitter') {
      const em = node as EmitterNode;
      return em.isWhiteLight ? 'White Emitter' : `Laser (${em.wavelength}nm)`;
    }
    if (node.type === 'prism') {
      const pr = node as PrismNode;
      return `Prism (n=${pr.refractiveIndex.toFixed(2)})`;
    }
    if (node.type === 'lens') {
      const ln = node as LensNode;
      return `${ln.lensType} Lens (n=${ln.refractiveIndex.toFixed(2)})`;
    }
    if (node.type === 'barrier') {
      const br = node as BarrierNode;
      return br.isMirror ? 'Planar Mirror' : 'Opaque Barrier';
    }
    if (node.type === 'black_hole') {
      const bh = node as BlackHoleNode;
      return `Black Hole (rs=${Math.round(bh.rs)}px)`;
    }
    return node.id;
  }

  function getDeg(rad: number): number {
    let d = Math.round((rad * 180) / Math.PI) % 360;
    if (d < 0) d += 360;
    return d;
  }
</script>

<svg class="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible" data-version={sceneVersion}>
  <defs>
    {#if showGrid}
      <pattern id="optical-bench-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148, 163, 184, 0.08)" stroke-width="1" />
        <circle cx="0" cy="0" r="1" fill="rgba(148, 163, 184, 0.22)" />
      </pattern>
    {/if}
  </defs>

  <!-- Optional Optical Bench Reference Grid -->
  {#if showGrid}
    <rect x="0" y="0" width="100%" height="100%" fill="url(#optical-bench-grid)" />
  {/if}

  <!-- Always-Visible Scene Element Outlines & Silhouettes (solves invisible elements in the dark) -->
  {#each nodes as node (node.id)}
    {@const isSel = selectedNode?.id === node.id}
    {@const isHov = hoveredNode?.id === node.id}
    {#if showOutlines || isSel || isHov}
      {#if node.type === 'prism'}
        {@const pr = node as PrismNode}
        {@const poly = pr.getObstaclePolygon()}
        <polygon
          points={polyToPoints(poly)}
          fill={isSel ? 'rgba(56, 189, 248, 0.12)' : isHov ? 'rgba(56, 189, 248, 0.09)' : 'rgba(56, 189, 248, 0.04)'}
          stroke={isSel ? '#38bdf8' : isHov ? '#7dd3fc' : 'rgba(56, 189, 248, 0.55)'}
          stroke-width={isSel ? 2 : isHov ? 1.75 : 1.25}
          stroke-linejoin="round"
        />
        {#each poly as v}
          <circle
            cx={v.x}
            cy={v.y}
            r={isSel || isHov ? 2.8 : 2}
            fill={isSel ? '#38bdf8' : '#bae6fd'}
            opacity={isSel || isHov ? 0.95 : 0.6}
          />
        {/each}
      {:else if node.type === 'lens'}
        {@const ln = node as LensNode}
        {@const poly = ln.getObstaclePolygon()}
        {@const axisP1 = ln.localToWorld({ x: -ln.thickness * 0.9, y: 0 })}
        {@const axisP2 = ln.localToWorld({ x: ln.thickness * 0.9, y: 0 })}
        <polygon
          points={polyToPoints(poly)}
          fill={isSel ? 'rgba(129, 140, 248, 0.14)' : isHov ? 'rgba(129, 140, 248, 0.10)' : 'rgba(129, 140, 248, 0.05)'}
          stroke={isSel ? '#818cf8' : isHov ? '#a5b4fc' : 'rgba(129, 140, 248, 0.6)'}
          stroke-width={isSel ? 2 : isHov ? 1.75 : 1.25}
          stroke-linejoin="round"
        />
        <!-- Principal Optical Axis Tick -->
        <line
          x1={axisP1.x}
          y1={axisP1.y}
          x2={axisP2.x}
          y2={axisP2.y}
          stroke="#818cf8"
          stroke-width="1"
          stroke-dasharray="2 2"
          opacity={isSel || isHov ? 0.75 : 0.35}
        />
      {:else if node.type === 'barrier'}
        {@const br = node as BarrierNode}
        {@const poly = br.getObstaclePolygon()}
        <polygon
          points={polyToPoints(poly)}
          fill={br.isMirror
            ? (isSel ? 'rgba(52, 211, 153, 0.25)' : 'rgba(52, 211, 153, 0.15)')
            : (isSel ? 'rgba(161, 161, 170, 0.38)' : 'rgba(82, 82, 91, 0.55)')}
          stroke={br.isMirror
            ? (isSel ? '#34d399' : isHov ? '#6ee7b7' : 'rgba(52, 211, 153, 0.75)')
            : (isSel ? '#f4f4f5' : isHov ? '#e4e4e7' : 'rgba(161, 161, 170, 0.75)')}
          stroke-width={isSel ? 2 : isHov ? 1.75 : 1.35}
          stroke-linejoin="round"
        />
      {:else if node.type === 'emitter'}
        {@const em = node as EmitterNode}
        {@const housing = em.getHousingPolygon()}
        {@const emColor = getEmitterColor(em)}
        {@const tip = em.localToWorld({ x: 14, y: 0 })}
        <polygon
          points={polyToPoints(housing)}
          fill={isSel ? 'rgba(251, 191, 36, 0.18)' : isHov ? 'rgba(251, 191, 36, 0.14)' : 'rgba(39, 39, 42, 0.75)'}
          stroke={isSel ? '#fbbf24' : isHov ? '#fcd34d' : 'rgba(251, 191, 36, 0.65)'}
          stroke-width={isSel ? 2 : isHov ? 1.75 : 1.25}
          stroke-linejoin="round"
        />
        <!-- Glowing Aperture Emission Bar -->
        <line
          x1={housing[1].x}
          y1={housing[1].y}
          x2={housing[2].x}
          y2={housing[2].y}
          stroke={emColor}
          stroke-width="3"
          stroke-linecap="round"
        />
        <!-- Direction Indicator -->
        <line
          x1={em.position.x}
          y1={em.position.y}
          x2={tip.x}
          y2={tip.y}
          stroke={emColor}
          stroke-width="1.5"
          opacity="0.85"
        />
        <circle cx={em.position.x} cy={em.position.y} r="3" fill={emColor} />
      {:else if node.type === 'black_hole'}
        {@const bh = node as BlackHoleNode}
        <!-- Gravitational Influence Boundary (12 rs) -->
        <circle
          cx={bh.position.x}
          cy={bh.position.y}
          r={bh.rInfluence}
          fill="none"
          stroke="#a855f7"
          stroke-width="1"
          stroke-dasharray="4 6"
          opacity={isSel || isHov ? 0.45 : 0.18}
        />
        <!-- Photon Sphere (1.5 rs) -->
        <circle
          cx={bh.position.x}
          cy={bh.position.y}
          r={bh.rs * 1.5}
          fill="none"
          stroke="#d8b4fe"
          stroke-width="1"
          stroke-dasharray="2 3"
          opacity={isSel || isHov ? 0.75 : 0.4}
        />
        <!-- Event Horizon (rs) -->
        <circle
          cx={bh.position.x}
          cy={bh.position.y}
          r={bh.rs}
          fill="rgba(9, 9, 13, 0.9)"
          stroke={isSel ? '#c084fc' : isHov ? '#e9d5ff' : 'rgba(192, 132, 252, 0.75)'}
          stroke-width={isSel ? 2.2 : 1.5}
        />
      {/if}

      <!-- Center Pivot Crosshair on Hover or Select -->
      {#if isSel || isHov}
        <circle
          cx={node.position.x}
          cy={node.position.y}
          r="2.5"
          fill="#ffffff"
          stroke="#09090b"
          stroke-width="1"
        />
      {/if}
    {/if}
  {/each}

  <!-- Hover Identification Pill (when hovering an unselected element in the dark) -->
  {#if hoveredNode && hoveredNode.id !== selectedNode?.id}
    <g transform="translate({hoveredNode.position.x}, {hoveredNode.position.y - Math.max(28, hoveredNode.boundingRadius + 12)})">
      <rect
        x="-68"
        y="-18"
        width="136"
        height="20"
        rx="4"
        fill="rgba(9, 9, 13, 0.88)"
        stroke="rgba(148, 163, 184, 0.4)"
        stroke-width="1"
      />
      <text
        x="0"
        y="-5"
        text-anchor="middle"
        fill="#e4e4e7"
        font-size="10"
        font-family="ui-monospace, monospace"
      >
        {getNodeLabel(hoveredNode)}
      </text>
    </g>
  {/if}

  <!-- Active Selection Gizmo Ring, Rotation Arm & Resize Handles -->
  {#if selectedNode}
    <!-- Selection Bounding Ring -->
    <circle
      cx={selectedNode.position.x}
      cy={selectedNode.position.y}
      r={selectedNode.boundingRadius}
      fill="none"
      stroke="#38bdf8"
      stroke-width="1.25"
      stroke-dasharray="4 4"
      opacity="0.65"
    />

    <!-- Rotation Arm & Pivot Handle -->
    {#if rotHandle}
      <line
        x1={selectedNode.position.x}
        y1={selectedNode.position.y}
        x2={rotHandle.position.x}
        y2={rotHandle.position.y}
        stroke="#38bdf8"
        stroke-width="1.5"
        opacity="0.85"
      />
      <circle
        cx={rotHandle.position.x}
        cy={rotHandle.position.y}
        r={hoveredHandle === HandleType.Rotate ? 7.5 : 6}
        fill={hoveredHandle === HandleType.Rotate ? '#38bdf8' : '#0284c7'}
        stroke="#ffffff"
        stroke-width="1.75"
      />
      <!-- Live Angle Badge near Rotation Handle -->
      <g transform="translate({rotHandle.position.x + 14}, {rotHandle.position.y - 8})">
        <rect
          x="0"
          y="-10"
          width="36"
          height="16"
          rx="3"
          fill="rgba(9, 9, 13, 0.85)"
          stroke="rgba(56, 189, 248, 0.5)"
          stroke-width="1"
        />
        <text
          x="18"
          y="1"
          text-anchor="middle"
          fill="#bae6fd"
          font-size="9.5"
          font-family="ui-monospace, monospace"
        >
          {getDeg(selectedNode.rotation)}°
        </text>
      </g>
    {/if}

    <!-- Resize Handles -->
    {#each resizeHandles as handle}
      {@const isHandleHov = hoveredHandle === handle.type}
      <rect
        x={handle.position.x - (isHandleHov ? 5.5 : 4.5)}
        y={handle.position.y - (isHandleHov ? 5.5 : 4.5)}
        width={isHandleHov ? 11 : 9}
        height={isHandleHov ? 11 : 9}
        fill={isHandleHov ? '#34d399' : '#10b981'}
        stroke="#ffffff"
        stroke-width="1.5"
        rx="2"
      />
    {/each}
  {/if}
</svg>
