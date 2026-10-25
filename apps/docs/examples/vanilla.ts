import { detectDocumentFormat } from '@hwpjs/core';
import { createCanvasSurface } from '@hwpjs/vanilla';
import { createBrowserEditor, type BrowserAssets } from './runtime';

export async function mountDocument(root: HTMLElement, file: File, assets: BrowserAssets) {
  const editor = createBrowserEditor(assets);
  let surface: ReturnType<typeof createCanvasSurface> | undefined;
  try {
    surface = createCanvasSurface({ root, editor, onStatus: console.info });
    const bytes = new Uint8Array(await file.arrayBuffer());
    await editor.load(bytes, { format: detectDocumentFormat(bytes), editable: true });
    surface.focus();
    return {
      editor,
      async dispose() {
        try { await surface?.dispose(); }
        finally { await editor.dispose(); }
      },
    };
  } catch (error) {
    try { await surface?.dispose(); }
    finally { await editor.dispose(); }
    throw error;
  }
}
