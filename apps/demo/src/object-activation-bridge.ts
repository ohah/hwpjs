import type { CanvasObjectActivation } from '@hwpjs/vanilla';
import type { HeadlessEditor } from '@hwpjs/core';

type Host = {
  registerObjectActivation?(listener: (event: CanvasObjectActivation) => void): () => void;
};
export function connectObjectActivation(
  host: Host | undefined,
  editor: Pick<HeadlessEditor, 'getEditorState'>,
  tools: {
    picture: { open(): void };
    chart: { open(target: { section: number; wrapper: number }): void };
    drawing: { open(target: { section: number; drawingNode: number }): void };
  },
) {
  return (
    host?.registerObjectActivation?.((event) => {
      const state = editor.getEditorState(),
        token = event.token,
        target = event.target;
      if (
        event.type !== 'double-click' ||
        state.status !== 'ready' ||
        state.historyRecoveryRequired ||
        !['editorId', 'documentId', 'generation', 'operationRevision', 'viewRevision'].every(
          (key) => (state as any)[key] === (token as any)[key],
        )
      )
        return;
      const content = state.content as any;
      const [rows, field] =
        target.kind === 'chart'
          ? [content?.chartTargets, 'wrapper']
          : target.kind === 'picture'
            ? [content?.pictures, 'pictureNode']
            : [content?.drawings, 'drawingNode'];
      if (
        !Array.isArray(rows) ||
        rows.filter(
          (row) => row?.section === target.section && row?.[field] === (target as any)[field],
        ).length !== 1
      )
        return;
      if (editor.getEditorState() !== state) return;
      if (target.kind === 'chart')
        tools.chart.open({ section: target.section, wrapper: target.wrapper });
      else if (target.kind === 'picture') tools.picture.open();
      else if (target.kind === 'drawing')
        tools.drawing.open({ section: target.section, drawingNode: target.drawingNode });
    }) ?? (() => {})
  );
}
