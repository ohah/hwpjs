import { layoutHwp5PageContent } from '../../../../web/preview/hwp5-page-layout.mjs';
import { layoutPageContent } from '../../../../web/preview/page-content-layout.mjs';
import { hitText } from '../../../../web/preview/text-geometry.mjs';

// Both format entry points are exactly the web pure layout functions. No parser,
// owner cache, source-offset rewriting or substitute document model lives here.
export function nativeDocumentLayout(content, measure) {
  if (typeof measure !== 'function') throw Error('NativeTextMeasurementUnavailable');
  return content.format === 'hwp5'
    ? layoutHwp5PageContent(content, measure)
    : layoutPageContent(content, measure);
}

export function createLiveCanvasController({
  editor,
  project,
  paintCommands,
  surface,
  spliceCommand,
}) {
  let generation = 0,
    disposed = false,
    frame = null;
  const live = () => {
    if (disposed) throw Error('Disposed');
  };
  async function refresh() {
    live();
    const epoch = ++generation;
    const state = editor.getEditorState();
    // project must enrich this Native snapshot using same-revision v3 sources.
    const content = await project(state);
    if (disposed || epoch !== generation) throw Error('StaleProjection');
    const layout = nativeDocumentLayout(content, surface.measure);
    if (layout.state !== 'paginated') throw Error(layout.error ?? 'IncompleteLayout');
    const commands = paintCommands(layout, content);
    const next = {
      protocol: 'hwpjs.native-canvas/1',
      state: 'paginated',
      revision: epoch,
      scale: surface.scale(),
      commands,
    };
    await surface.present(next);
    if (disposed || epoch !== generation) throw Error('StalePresentation');
    frame = { epoch, state, layout, scale: next.scale };
    return next;
  }
  async function select(point) {
    live();
    const f = frame;
    if (!f || f.epoch !== generation || point.revision !== f.epoch) throw Error('StaleFrame');
    if (
      ![point.x, point.y, point.width, point.height].every(Number.isFinite) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= point.width ||
      point.y >= point.height
    )
      throw Error('OutsideSurface');
    const hit = hitText(f.layout, point.x / f.scale, point.y / f.scale);
    if (!hit) throw Error('NoTextOwner');
    const row = f.state.content.paragraphs.find(
      (p) => p.section === hit.section && p.paragraph === hit.paragraph,
    );
    if (!row?.editable || row.displayComplete !== true) throw Error('ProtectedOwner');
    // hit.unit is display UTF16, not Native raw offset. Public provider owns mapping.
    const target = {
      ...f.state.token,
      coordinateSpace: 'display',
      format: f.state.content.format,
      section: row.section,
      paragraph: row.paragraph,
      owner: row.selectionOwner,
      startUnit: hit.unit,
      endUnit: hit.unit,
      affinity: hit.affinity,
    };
    await editor.setSelection(target);
    return target;
  }
  return {
    refresh,
    select,
    async input(point, text) {
      const target = await select(point);
      const result = await editor.dispatchCommand(spliceCommand, { target, text });
      if (result.status !== 'committed-with-snapshot') throw Error('SpliceUnapplied');
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
    async save() {
      live();
      return editor.save();
    },
    async reopen(bytes, format) {
      live();
      generation++;
      frame = null;
      await editor.load(bytes, { format });
      return refresh();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      frame = null;
      try {
        await surface.dispose();
      } finally {
        await editor.dispose();
      }
    },
  };
}
