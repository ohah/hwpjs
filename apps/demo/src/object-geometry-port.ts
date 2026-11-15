import {
  SET_OBJECT_GEOMETRY_COMMAND,
  type HeadlessEditor,
  type EditorState,
  type StateToken,
  type ObjectGeometrySelector,
  type ObjectGeometryPatch,
  type ObjectGeometryRead,
} from '@hwpjs/core';
export interface ObjectGeometryCapture {
  readonly state: EditorState;
  readonly token: StateToken;
  readonly stateVersion: number;
  readonly read: Extract<ObjectGeometryRead, { state: 'available' }>;
}
export function createObjectGeometryPort(
  editor: Pick<HeadlessEditor, 'getEditorState' | 'getObjectGeometry' | 'dispatchCommand'>,
) {
  const tokenKeys = [
    'editorId',
    'documentId',
    'generation',
    'operationRevision',
    'viewRevision',
  ] as const;
  const captures = new WeakSet<ObjectGeometryCapture>();
  const current = (capture: ObjectGeometryCapture) =>
    captures.has(capture) &&
    editor.getEditorState() === capture.state &&
    capture.state.status === 'ready' &&
    !capture.state.historyRecoveryRequired &&
    capture.state.stateVersion === capture.stateVersion &&
    tokenKeys.every((key) => capture.state.token[key] === capture.token[key]);
  return {
    current,
    async read(selector: ObjectGeometrySelector) {
      const state = editor.getEditorState();
      if (state.status !== 'ready' || state.historyRecoveryRequired)
        throw Error('현재 개체 상태를 확인할 수 없습니다.');
      const token = Object.freeze({ ...state.token }),
        stateVersion = state.stateVersion;
      const read = await editor.getObjectGeometry(selector, { token });
      if (
        editor.getEditorState() !== state ||
        state.stateVersion !== stateVersion ||
        !tokenKeys.every((key) => state.token[key] === token[key])
      )
        throw Error('문서가 바뀌었습니다. 개체 속성을 다시 열어주세요.');
      if (read.state !== 'available') return { available: false as const, reason: read.reason };
      const capture = Object.freeze({ state, token, stateVersion, read });
      captures.add(capture);
      return { available: true as const, capture };
    },
    async apply(capture: ObjectGeometryCapture, patch: ObjectGeometryPatch) {
      if (!current(capture)) throw Error('문서가 바뀌었습니다. 개체 속성을 다시 열어주세요.');
      return editor.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, {
        target: capture.read.target,
        patch,
      });
    },
  };
}
export type ObjectGeometryPort = ReturnType<typeof createObjectGeometryPort>;
