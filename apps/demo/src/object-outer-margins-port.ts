import {
  SET_OBJECT_OUTER_MARGINS_COMMAND,
  type HeadlessEditor,
  type EditorState,
  type StateToken,
  type ObjectOuterMargins,
  type ObjectOuterMarginsRead,
  type ObjectOuterMarginsSelector,
} from '@hwpjs/core';
export type ObjectOuterMarginsEditor = Pick<
  HeadlessEditor,
  'getEditorState' | 'getObjectOuterMargins' | 'dispatchCommand'
>;
export interface ObjectOuterMarginsCapture {
  readonly state: EditorState;
  readonly token: StateToken;
  readonly stateVersion: number;
  readonly read: Extract<ObjectOuterMarginsRead, { state: 'available' }>;
}
const tokenKeys = [
  'editorId',
  'documentId',
  'generation',
  'operationRevision',
  'viewRevision',
] as const;
const editableState = (state: EditorState) => {
  const content = state.content;
  return (
    state.status === 'ready' &&
    !state.historyRecoveryRequired &&
    content !== null &&
    typeof content === 'object' &&
    'format' in content &&
    content.format === 'hwpx' &&
    !('readOnly' in content && content.readOnly === true)
  );
};
/** Current drawing observation is only a UI fence; the SDK issues a separate opaque margin target. */
export function createObjectOuterMarginsPort(
  editor: ObjectOuterMarginsEditor,
  drawingCurrent: () => boolean,
) {
  const captures = new WeakMap<ObjectOuterMarginsCapture, { used: boolean }>();
  const current = (capture: ObjectOuterMarginsCapture) => {
    try {
      return (
        captures.get(capture)?.used === false &&
        drawingCurrent() &&
        editor.getEditorState() === capture.state &&
        editableState(capture.state) &&
        capture.state.stateVersion === capture.stateVersion &&
        tokenKeys.every((key) => capture.state.token[key] === capture.token[key]) &&
        editor.getEditorState() === capture.state
      );
    } catch {
      return false;
    }
  };
  return {
    current,
    async read(selector: ObjectOuterMarginsSelector) {
      const state = editor.getEditorState();
      if (!drawingCurrent() || !editableState(state))
        return { available: false as const, reason: '현재 개체의 바깥 여백은 변경할 수 없습니다.' };
      const token = Object.freeze({ ...state.token }),
        stateVersion = state.stateVersion;
      const read = await editor.getObjectOuterMargins(selector, { token });
      if (
        !drawingCurrent() ||
        editor.getEditorState() !== state ||
        !editableState(state) ||
        state.stateVersion !== stateVersion ||
        !tokenKeys.every((key) => state.token[key] === token[key])
      )
        throw Error('문서가 바뀌었습니다. 개체 속성을 다시 열어주세요.');
      if (read.state !== 'available') return { available: false as const, reason: read.reason };
      if (
        read.observation.format !== 'hwpx' ||
        read.observation.section !== selector.section ||
        read.observation.drawingNode !== selector.node
      )
        throw Error('선택한 개체의 바깥 여백을 확인할 수 없습니다.');
      const capture = Object.freeze({ state, token, stateVersion, read });
      captures.set(capture, { used: false });
      if (!current(capture)) throw Error('개체 속성을 다시 열어주세요.');
      return { available: true as const, capture };
    },
    async apply(capture: ObjectOuterMarginsCapture, margins: ObjectOuterMargins) {
      if (!current(capture)) throw Error('개체 속성을 다시 열어주세요.');
      const values = { ...margins },
        dispatch = editor.dispatchCommand;
      if (!current(capture)) throw Error('개체 속성을 다시 열어주세요.');
      const issued = captures.get(capture);
      if (!issued) throw Error('개체 속성을 다시 열어주세요.');
      issued.used = true;
      return dispatch.call(editor, SET_OBJECT_OUTER_MARGINS_COMMAND, {
        target: capture.read.target,
        margins: values,
      });
    },
  };
}
