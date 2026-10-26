<script lang="ts">
  import { canvasSurface } from "./action.ts";
  import type { CanvasEditorProps } from "./types.ts";

  let {
    editor,
    environment,
    scale,
    onStatus,
    onError,
    onReady,
    class: className,
    style,
    "aria-label": label = "Document editor",
  }: CanvasEditorProps = $props();
</script>

<div
  class={className}
  {style}
  aria-label={label}
  use:canvasSurface={{ editor, environment, scale, onStatus, onError, onReady }}
></div>
