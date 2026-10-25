import { CanvasEditor, canvasSurface } from '@hwpjs/svelte';
import type { CanvasEditorProps, CanvasSurface } from '@hwpjs/svelte';
import type { Component } from 'svelte';
import { createEditor } from '@hwpjs/core';
const component: Component<CanvasEditorProps> = CanvasEditor;
const props: CanvasEditorProps = {
  editor: createEditor({ runtimeFactory: () => { throw Error('type-only fixture'); } }),
  onReady(surface: CanvasSurface) { surface.focus(); },
  'aria-label': '문서',
};
void [component, props, canvasSurface];
