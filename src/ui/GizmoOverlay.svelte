<script lang="ts">
  import { SceneNode } from '../engine/scene/sceneNode';
  import { HandleType, type GizmoHandle } from '../engine/interaction/hitTester';

  let {
    selectedNode,
    handles = []
  }: {
    selectedNode: SceneNode | null;
    handles: GizmoHandle[];
  } = $props();

  let rotHandle = $derived(handles.find(h => h.type === HandleType.Rotate));
  let resizeHandles = $derived(handles.filter(h => h.type === HandleType.ResizePrimary || h.type === HandleType.ResizeSecondary));
</script>

{#if selectedNode}
  <svg class="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
    <!-- Selection Bounding Ring -->
    <circle
      cx={selectedNode.position.x}
      cy={selectedNode.position.y}
      r={selectedNode.boundingRadius}
      fill="none"
      stroke="#38bdf8"
      stroke-width="1"
      stroke-dasharray="3 3"
      opacity="0.45"
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
        opacity="0.75"
      />
      <circle
        cx={rotHandle.position.x}
        cy={rotHandle.position.y}
        r={6}
        fill="#0284c7"
        stroke="#ffffff"
        stroke-width="1.5"
      />
    {/if}

    <!-- Resize Handles -->
    {#each resizeHandles as handle}
      <rect
        x={handle.position.x - 4.5}
        y={handle.position.y - 4.5}
        width={9}
        height={9}
        fill="#10b981"
        stroke="#ffffff"
        stroke-width="1.5"
        rx="1.5"
      />
    {/each}
  </svg>
{/if}
