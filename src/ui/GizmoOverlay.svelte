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

  // Build fresh, plain-object geometry snapshots on every sceneVersion tick
  // so Svelte 5 always updates SVG coordinates at 60 FPS during drag/rotate/resize.
  let renderedNodes = $derived.by(() => {
    const _v = sceneVersion;
    return nodes.map((node) => {
      const isSel = selectedNode?.id === node.id;
      const isHov = hoveredNode?.id === node.id;
      const cx = node.position.x;
      const cy = node.position.y;
      const rot = node.rotation;
      const deg = getDeg(rot);
      const boundingRadius = node.boundingRadius;
      const label = getNodeLabel(node);

      if (node.type === 'prism') {
        const pr = node as PrismNode;
        const poly = pr.getObstaclePolygon();
        return {
          id: node.id,
          vKey: `${node.id}:${_v}`,
          type: 'prism' as const,
          isSel,
          isHov,
          cx,
          cy,
          deg,
          boundingRadius,
          label,
          points: polyToPoints(poly),
          verts: poly
        };
      } else if (node.type === 'lens') {
        const ln = node as LensNode;
        const poly = ln.getObstaclePolygon();
        const axisP1 = ln.localToWorld({ x: -ln.thickness * 0.9, y: 0 });
        const axisP2 = ln.localToWorld({ x: ln.thickness * 0.9, y: 0 });
        return {
          id: node.id,
          vKey: `${node.id}:${_v}`,
          type: 'lens' as const,
          isSel,
          isHov,
          cx,
          cy,
          deg,
          boundingRadius,
          label,
          points: polyToPoints(poly),
          axisP1,
          axisP2
        };
      } else if (node.type === 'barrier') {
        const br = node as BarrierNode;
        const poly = br.getObstaclePolygon();
        return {
          id: node.id,
          vKey: `${node.id}:${_v}`,
          type: 'barrier' as const,
          isSel,
          isHov,
          cx,
          cy,
          deg,
          boundingRadius,
          label,
          isMirror: br.isMirror,
          points: polyToPoints(poly)
        };
      } else if (node.type === 'emitter') {
        const em = node as EmitterNode;
        const housing = em.getHousingPolygon();
        const tip = em.localToWorld({ x: 14, y: 0 });
        return {
          id: node.id,
          vKey: `${node.id}:${_v}`,
          type: 'emitter' as const,
          isSel,
          isHov,
          cx,
          cy,
          deg,
          boundingRadius,
          label,
          points: polyToPoints(housing),
          ap1: housing[1],
          ap2: housing[2],
          tip,
          emColor: getEmitterColor(em)
        };
      } else {
        const bh = node as BlackHoleNode;
        return {
          id: node.id,
          vKey: `${node.id}:${_v}`,
          type: 'black_hole' as const,
          isSel,
          isHov,
          cx,
          cy,
          deg,
          boundingRadius,
          label,
          rs: bh.rs,
          rPhoton: bh.rs * 1.5,
          rInfluence: bh.rInfluence
        };
      }
    });
  });

  let activeSnapshot = $derived.by(() => {
    void sceneVersion;
    if (!selectedNode) return null;
    return renderedNodes.find(n => n.id === selectedNode.id) ?? null;
  });

  let hoveredSnapshot = $derived.by(() => {
    void sceneVersion;
    if (!hoveredNode || hoveredNode.id === selectedNode?.id) return null;
    return renderedNodes.find(n => n.id === hoveredNode.id) ?? null;
  });

  let rotHandle = $derived.by(() => {
    void sceneVersion;
    const h = handles.find(item => item.type === HandleType.Rotate);
    return h ? { x: h.position.x, y: h.position.y, type: h.type } : null;
  });

  let resizeHandles = $derived.by(() => {
    void sceneVersion;
    return handles
      .filter(h => h.type === HandleType.ResizePrimary || h.type === HandleType.ResizeSecondary)
      .map(h => ({ x: h.position.x, y: h.position.y, type: h.type }));
  });
</script>

<svg class="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
  <defs>
    {#if showGrid}
      <pattern id="optical-bench-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148, 163, 184, 0.08)" stroke-width="1" />
        <circle cx="0" cy="0" r="1" fill="rgba(148, 163, 184, 0.22)" />
      </pattern>
    {/if}
    <!-- Relativistic Black Hole Photon Ring & Accretion Lensing Halo -->
    <radialGradient id="bh-photon-ring" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000000" stop-opacity="1" />
      <stop offset="48%" stop-color="#000000" stop-opacity="1" />
      <stop offset="53%" stop-color="#fff7ed" stop-opacity="0.95" />
      <stop offset="58%" stop-color="#fb923c" stop-opacity="0.65" />
      <stop offset="68%" stop-color="#ea580c" stop-opacity="0.22" />
      <stop offset="85%" stop-color="#7c2d12" stop-opacity="0.06" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>

  {#if showGrid}
    <rect x="0" y="0" width="100%" height="100%" fill="url(#optical-bench-grid)" />
  {/if}

  {#each renderedNodes as item (item.vKey)}
    {#if showOutlines || item.isSel || item.isHov || item.type === 'black_hole'}
      {#if item.type === 'prism'}
        <polygon
          points={item.points}
          fill={item.isSel ? 'rgba(56, 189, 248, 0.12)' : item.isHov ? 'rgba(56, 189, 248, 0.09)' : 'rgba(56, 189, 248, 0.04)'}
          stroke={item.isSel ? '#38bdf8' : item.isHov ? '#7dd3fc' : 'rgba(56, 189, 248, 0.55)'}
          stroke-width={item.isSel ? 2 : item.isHov ? 1.75 : 1.25}
          stroke-linejoin="round"
        />
        {#each item.verts as v}
          <circle
            cx={v.x}
            cy={v.y}
            r={item.isSel || item.isHov ? 2.8 : 2}
            fill={item.isSel ? '#38bdf8' : '#bae6fd'}
            opacity={item.isSel || item.isHov ? 0.95 : 0.6}
          />
        {/each}
      {:else if item.type === 'lens'}
        <polygon
          points={item.points}
          fill={item.isSel ? 'rgba(129, 140, 248, 0.14)' : item.isHov ? 'rgba(129, 140, 248, 0.10)' : 'rgba(129, 140, 248, 0.05)'}
          stroke={item.isSel ? '#818cf8' : item.isHov ? '#a5b4fc' : 'rgba(129, 140, 248, 0.6)'}
          stroke-width={item.isSel ? 2 : item.isHov ? 1.75 : 1.25}
          stroke-linejoin="round"
        />
        <line
          x1={item.axisP1.x}
          y1={item.axisP1.y}
          x2={item.axisP2.x}
          y2={item.axisP2.y}
          stroke="#818cf8"
          stroke-width="1"
          stroke-dasharray="2 2"
          opacity={item.isSel || item.isHov ? 0.75 : 0.35}
        />
      {:else if item.type === 'barrier'}
        <polygon
          points={item.points}
          fill={item.isMirror
            ? (item.isSel ? 'rgba(52, 211, 153, 0.25)' : 'rgba(52, 211, 153, 0.15)')
            : (item.isSel ? 'rgba(161, 161, 170, 0.38)' : 'rgba(82, 82, 91, 0.55)')}
          stroke={item.isMirror
            ? (item.isSel ? '#34d399' : item.isHov ? '#6ee7b7' : 'rgba(52, 211, 153, 0.75)')
            : (item.isSel ? '#f4f4f5' : item.isHov ? '#e4e4e7' : 'rgba(161, 161, 170, 0.75)')}
          stroke-width={item.isSel ? 2 : item.isHov ? 1.75 : 1.35}
          stroke-linejoin="round"
        />
      {:else if item.type === 'emitter'}
        <polygon
          points={item.points}
          fill={item.isSel ? 'rgba(251, 191, 36, 0.18)' : item.isHov ? 'rgba(251, 191, 36, 0.14)' : 'rgba(39, 39, 42, 0.75)'}
          stroke={item.isSel ? '#fbbf24' : item.isHov ? '#fcd34d' : 'rgba(251, 191, 36, 0.65)'}
          stroke-width={item.isSel ? 2 : item.isHov ? 1.75 : 1.25}
          stroke-linejoin="round"
        />
        <line
          x1={item.ap1.x}
          y1={item.ap1.y}
          x2={item.ap2.x}
          y2={item.ap2.y}
          stroke={item.emColor}
          stroke-width="3"
          stroke-linecap="round"
        />
        <line
          x1={item.cx}
          y1={item.cy}
          x2={item.tip.x}
          y2={item.tip.y}
          stroke={item.emColor}
          stroke-width="1.5"
          opacity="0.85"
        />
        <circle cx={item.cx} cy={item.cy} r="3" fill={item.emColor} />
      {:else if item.type === 'black_hole'}
        <!-- Realistic Relativistic Photon Ring Halo & Pure Black Event Horizon Shadow -->
        <circle
          cx={item.cx}
          cy={item.cy}
          r={item.rs * 2.0}
          fill="url(#bh-photon-ring)"
        />
        <circle
          cx={item.cx}
          cy={item.cy}
          r={item.rs}
          fill="#000000"
          stroke={item.isSel ? '#fb923c' : item.isHov ? '#fdba74' : 'rgba(251, 146, 60, 0.55)'}
          stroke-width={item.isSel ? 1.5 : 1.0}
        />
        <!-- Only show technical photon-sphere & influence rings when selected or hovered -->
        {#if item.isSel || item.isHov}
          <circle
            cx={item.cx}
            cy={item.cy}
            r={item.rPhoton}
            fill="none"
            stroke="#fdba74"
            stroke-width="1"
            stroke-dasharray="3 3"
            opacity="0.65"
          />
          <circle
            cx={item.cx}
            cy={item.cy}
            r={item.rInfluence}
            fill="none"
            stroke="#fb923c"
            stroke-width="1"
            stroke-dasharray="4 8"
            opacity="0.28"
          />
        {/if}
      {/if}

      {#if item.isSel || item.isHov}
        <circle
          cx={item.cx}
          cy={item.cy}
          r="2.5"
          fill="#ffffff"
          stroke="#09090b"
          stroke-width="1"
        />
      {/if}
    {/if}
  {/each}

  <!-- Hover Identification Pill -->
  {#if hoveredSnapshot}
    <g transform="translate({hoveredSnapshot.cx}, {hoveredSnapshot.cy - Math.max(28, hoveredSnapshot.boundingRadius + 12)})">
      <rect
        x="-74"
        y="-18"
        width="148"
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
        {hoveredSnapshot.label}
      </text>
    </g>
  {/if}

  <!-- Active Selection Gizmo Ring, Rotation Arm & Resize Handles -->
  {#if activeSnapshot}
    <circle
      cx={activeSnapshot.cx}
      cy={activeSnapshot.cy}
      r={activeSnapshot.boundingRadius}
      fill="none"
      stroke="#38bdf8"
      stroke-width="1.25"
      stroke-dasharray="4 4"
      opacity="0.65"
    />

    {#if rotHandle && activeSnapshot.type !== 'black_hole'}
      <line
        x1={activeSnapshot.cx}
        y1={activeSnapshot.cy}
        x2={rotHandle.x}
        y2={rotHandle.y}
        stroke="#38bdf8"
        stroke-width="1.5"
        opacity="0.85"
      />
      <circle
        cx={rotHandle.x}
        cy={rotHandle.y}
        r={hoveredHandle === HandleType.Rotate ? 7.5 : 6}
        fill={hoveredHandle === HandleType.Rotate ? '#38bdf8' : '#0284c7'}
        stroke="#ffffff"
        stroke-width="1.75"
      />
      <g transform="translate({rotHandle.x + 14}, {rotHandle.y - 8})">
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
          {activeSnapshot.deg}°
        </text>
      </g>
    {/if}

    {#each resizeHandles as handle}
      {@const isHandleHov = hoveredHandle === handle.type}
      <rect
        x={handle.x - (isHandleHov ? 5.5 : 4.5)}
        y={handle.y - (isHandleHov ? 5.5 : 4.5)}
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
