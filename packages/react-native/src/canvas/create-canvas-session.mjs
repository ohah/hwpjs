import { projectNativeContent } from './project-content.mjs';
import { createNativeRenderer } from './native-renderer.mjs';

/** editor and transport MUST be the same provider instance. Composition factory
 * supplies them together; the session never opens a second Native document. */
export function createCanvasSession({ editor, transport, surface, spliceCommand }) {
  let closed = false,
    content = null,
    snapshot = null,
    epoch = 0,
    lastEdit = null,
    disposal = null;
  const nativeSurface = {
    ...surface,
    currentContent: () => content,
    pictureBytes: (token, revision, section, node) =>
      transport.pictureBytes(token, revision, section, node),
  };
  const renderer = createNativeRenderer(nativeSurface);
  const live = () => {
    if (closed) throw Error('Disposed');
  };
  async function refresh() {
    live();
    const generation = ++epoch;
    const state = editor.getEditorState();
    const bytes = await transport.renderSources(state.token, state.content.nativeRevision);
    if (closed || generation !== epoch || editor.getEditorState() !== state)
      throw Error('StaleRenderSources');
    const next = projectNativeContent(state.content, bytes);
    next.canvasObservationToken = state.token;
    snapshot = state;
    content = next;
    return renderer.show(content);
  }
  return {
    async load(bytes, format) {
      live();
      epoch++;
      await editor.load(bytes, { format });
      return refresh();
    },
    refresh,
    fontMetadata: () => renderer.fontMetadata(),
    lastEdit: () => lastEdit && { ...lastEdit },
    revealEditable() {
      live();
      const p = snapshot?.content.paragraphs.find(
        (r) => r.editable && r.displayComplete && r.ownerKind === 'body',
      );
      if (!p) throw Error('NoEditableBody');
      const display = content.paragraphs.find(
        (r) => r.section === p.section && (r.publicParagraph ?? r.paragraph) === p.paragraph,
      );
      if (!display) throw Error('NoEditableLayoutOwner');
      return renderer.reveal(display.section, display.paragraph);
    },
    async input(point, text) {
      live();
      const hit = renderer.hit(point);
      if (!hit) throw Error('NoTextOwner');
      if (snapshot !== editor.getEditorState()) throw Error('StaleFrame');
      const display = content.paragraphs.find(
        (r) => r.section === hit.section && r.paragraph === hit.paragraph,
      );
      const p = snapshot.content.paragraphs.find(
        (r) =>
          r.section === hit.section && r.paragraph === (display?.publicParagraph ?? hit.paragraph),
      );
      if (!p?.editable || !p.displayComplete) throw Error('ProtectedOwner');
      const target = {
        ...snapshot.token,
        coordinateSpace: 'display',
        format: snapshot.content.format,
        section: p.section,
        paragraph: p.paragraph,
        owner: p.selectionOwner,
        startUnit: hit.unit,
        endUnit: hit.unit,
        affinity: hit.affinity,
      };
      await editor.setSelection(target);
      const result = await editor.dispatchCommand(spliceCommand, { target, text });
      if (result.status !== 'committed-with-snapshot') throw Error('SpliceUnapplied');
      lastEdit = {
        format: snapshot.content.format,
        section: p.section,
        paragraph: p.paragraph,
        startUnit: hit.unit,
        endUnit: hit.unit,
        text,
        rawPlain: p.rawPlain,
        coordinateSpace: 'display-utf16',
        sourceNativeRevision: snapshot.content.nativeRevision,
      };
      return refresh();
    },
    async undo() {
      live();
      const r = await editor.undo();
      if (r.status === 'committed-with-snapshot') await refresh();
      return r;
    },
    async redo() {
      live();
      const r = await editor.redo();
      if (r.status === 'committed-with-snapshot') await refresh();
      return r;
    },
    async save(options) {
      live();
      return editor.save(options);
    },
    async reopen(bytes, format) {
      live();
      epoch++;
      await editor.load(bytes, { format });
      return refresh();
    },
    scroll: (x, y) => renderer.scroll(x, y),
    dispose() {
      if (disposal) return disposal;
      closed = true;
      epoch++;
      disposal = Promise.resolve().then(async () => {
        try {
          renderer.close();
        } finally {
          await editor.dispose();
        }
      });
      return disposal;
    },
  };
}
