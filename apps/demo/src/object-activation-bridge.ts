import { createDrawingObservationQuery } from '../../../web/preview/drawing-observation.mjs';
import type { CanvasObjectActivation, CanvasObjectPropertiesRequest } from '@hwpjs/vanilla';
import type { HeadlessEditor } from '@hwpjs/core';

type Host = {
  registerObjectPropertiesRequest?(
    listener: (event: CanvasObjectPropertiesRequest) => void,
  ): () => void;
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
  const dispatch = (event: CanvasObjectActivation | CanvasObjectPropertiesRequest) => {
    const state = editor.getEditorState(),
      token = event.token,
      target = event.target;
    if (
      state.status !== 'ready' ||
      state.historyRecoveryRequired ||
      !['editorId', 'documentId', 'generation', 'operationRevision', 'viewRevision'].every(
        (key) => (state as any)[key] === (token as any)[key],
      )
    )
      return;
    const content = state.content as any;
    if (target.kind === 'drawing') {
      const observed = createDrawingObservationQuery(content).get(
        target.section,
        target.drawingNode,
      );
      if (!observed?.activationSafe) return;
    } else {
      const [rows, field] =
        target.kind === 'chart'
          ? [content?.chartTargets, 'wrapper']
          : [content?.pictures, 'pictureNode'];
      if (
        !Array.isArray(rows) ||
        rows.filter(
          (row) => row?.section === target.section && row?.[field] === (target as any)[field],
        ).length !== 1
      )
        return;
    }
    if (editor.getEditorState() !== state) return;
    if (target.kind === 'chart')
      tools.chart.open({ section: target.section, wrapper: target.wrapper });
    else if (target.kind === 'picture') tools.picture.open();
    else if (target.kind === 'drawing')
      tools.drawing.open({ section: target.section, drawingNode: target.drawingNode });
  };
  const stop = host?.registerObjectActivation?.((event) => {
    if (event.type === 'double-click') dispatch(event);
  });
  let stopProperties: (() => void) | undefined;
  try {
    stopProperties = host?.registerObjectPropertiesRequest?.((event) => {
      if (event.type === 'properties-shortcut') dispatch(event);
    });
  } catch (error) {
    stop?.();
    throw error;
  }
  return () => {
    stop?.();
    stopProperties?.();
  };
}
