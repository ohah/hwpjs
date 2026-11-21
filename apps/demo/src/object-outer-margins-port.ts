import { outerMarginDraft, outerMarginFields } from './object-outer-margins-input.ts';
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
  readonly selector: ObjectOuterMarginsSelector;
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
    state.nativeHistoryStats?.poisoned !== true &&
    (state.capabilities as { readOnly?: boolean } | undefined)?.readOnly !== true &&
    content !== null &&
    typeof content === 'object' &&
    'format' in content &&
    (content.format === 'hwpx' || content.format === 'hwp5') &&
    !('readOnly' in content && content.readOnly === true)
  );
};
const selectorMatchesState = (state: EditorState, selector: ObjectOuterMarginsSelector) => {
  const format = (state.content as { format?: unknown } | null)?.format;
  return format === 'hwpx'
    ? selector.kind === 'drawing'
    : format === 'hwp5' && (selector.kind === 'picture' || selector.kind === 'textbox');
};
const ownerMatches = (
  state: EditorState,
  selector: ObjectOuterMarginsSelector,
  read: Extract<ObjectOuterMarginsRead, { state: 'available' }>,
) => {
  const o = read.observation,
    format = (state.content as { format?: unknown } | null)?.format;
  return (
    selectorMatchesState(state, selector) &&
    o.format === format &&
    o.section === selector.section &&
    o.drawingNode === selector.node &&
    (format === 'hwp5' ? o.kind === selector.kind : o.kind === undefined || o.kind === 'drawing')
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
        ownerMatches(capture.state, capture.selector, capture.read) &&
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
      if (!drawingCurrent() || !editableState(state) || !selectorMatchesState(state, selector))
        return { available: false as const, reason: '현재 개체의 바깥 여백은 변경할 수 없습니다.' };
      const token = Object.freeze({ ...state.token }),
        stateVersion = state.stateVersion;
      let read: ObjectOuterMarginsRead;
      try {
        read = await editor.getObjectOuterMargins(selector, { token });
      } catch (error) {
        if (
          !drawingCurrent() ||
          editor.getEditorState() !== state ||
          !editableState(state) ||
          state.stateVersion !== stateVersion ||
          !tokenKeys.every((key) => state.token[key] === token[key])
        )
          throw Error('문서가 바뀌었습니다. 개체 속성을 다시 열어주세요.');
        if (
          (state.content as { format?: unknown })?.format === 'hwpx' &&
          error instanceof Error &&
          error.message === 'UnsupportedObjectOuterMargins'
        )
          return { available: false as const, reason: 'UnsupportedObjectOuterMargins' };
        throw error;
      }
      if (
        !drawingCurrent() ||
        editor.getEditorState() !== state ||
        !editableState(state) ||
        state.stateVersion !== stateVersion ||
        !tokenKeys.every((key) => state.token[key] === token[key])
      )
        throw Error('문서가 바뀌었습니다. 개체 속성을 다시 열어주세요.');
      if (!read || read.state !== 'available')
        return {
          available: false as const,
          reason: read?.reason ?? '바깥 여백을 확인할 수 없습니다.',
        };
      if (!ownerMatches(state, selector, read))
        throw Error('선택한 개체의 바깥 여백을 확인할 수 없습니다.');
      if (
        Object.hasOwn(read.observation, 'verticalOnly') &&
        (read.observation.verticalOnly !== true || read.observation.format !== 'hwpx')
      )
        throw Error('선택한 개체의 바깥 여백을 확인할 수 없습니다.');
      outerMarginDraft(read.observation.margins, read.observation.format);
      const margins = Object.freeze({ ...read.observation.margins });
      const ownedRead = Object.freeze({
        ...read,
        observation: Object.freeze({ ...read.observation, margins }),
      });
      const capture = Object.freeze({
        state,
        token,
        stateVersion,
        selector: Object.freeze({ ...selector }),
        read: ownedRead,
      });
      captures.set(capture, { used: false });
      if (!current(capture)) throw Error('개체 속성을 다시 열어주세요.');
      return { available: true as const, capture };
    },
    async apply(capture: ObjectOuterMarginsCapture, margins: ObjectOuterMargins) {
      if (!current(capture)) throw Error('개체 속성을 다시 열어주세요.');
      const values = { ...margins },
        dispatch = editor.dispatchCommand;
      for (const field of outerMarginFields) {
        const value = values[field];
        if (!Number.isSafeInteger(value) || value < 0 || value > 32767 || Object.is(value, -0))
          throw Error('바깥 여백을 0 이상으로 수정해주세요.');
      }
      if (
        capture.read.observation.verticalOnly === true &&
        (values.left !== capture.read.observation.margins.left ||
          values.right !== capture.read.observation.margins.right)
      )
        throw Error('위아래 배치에서는 위쪽과 아래쪽 여백만 변경할 수 있습니다.');
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
