import { bodyFlowValues, checkedBodyFlow } from './object-body-flow-input.ts';
import {
  SET_OBJECT_BODY_FLOW_COMMAND,
  type HeadlessEditor,
  type EditorState,
  type StateToken,
  type ObjectBodyFlow,
  type ObjectBodyFlowRead,
  type ObjectBodyFlowSelector,
} from '@hwpjs/core';
export type ObjectBodyFlowEditor = Pick<
  HeadlessEditor,
  'getEditorState' | 'getObjectBodyFlow' | 'dispatchCommand'
>;
export interface ObjectBodyFlowCapture {
  readonly state: EditorState;
  readonly token: StateToken;
  readonly stateVersion: number;
  readonly read: Extract<ObjectBodyFlowRead, { state: 'available' }>;
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
    content.format === 'hwpx' &&
    !('readOnly' in content && content.readOnly === true)
  );
};
/** Current drawing observation is only a UI fence; the SDK issues a separate opaque body flow target. */
export function createObjectBodyFlowPort(
  editor: ObjectBodyFlowEditor,
  drawingCurrent: () => boolean,
) {
  const captures = new WeakMap<ObjectBodyFlowCapture, { used: boolean }>();
  const current = (capture: ObjectBodyFlowCapture) => {
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
    async read(selector: ObjectBodyFlowSelector) {
      const state = editor.getEditorState();
      if (!drawingCurrent() || !editableState(state))
        return {
          available: false as const,
          reason: '현재 개체의 본문 배치는 변경할 수 없습니다.',
        };
      const token = Object.freeze({ ...state.token }),
        stateVersion = state.stateVersion;
      const read = await editor.getObjectBodyFlow(selector, { token });
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
          reason: read?.reason ?? '현재 개체의 본문 배치를 확인할 수 없습니다.',
        };
      if (
        read.observation.format !== 'hwpx' ||
        read.observation.section !== selector.section ||
        read.observation.drawingNode !== selector.node
      )
        throw Error('선택한 개체의 본문 배치를 확인할 수 없습니다.');
      const flow = Object.freeze(checkedBodyFlow(read.observation.flow));
      const ownedRead = Object.freeze({
        ...read,
        observation: Object.freeze({ ...read.observation, flow }),
      });
      const capture = Object.freeze({
        state,
        token,
        stateVersion,
        read: ownedRead,
      });
      captures.set(capture, { used: false });
      if (!current(capture)) throw Error('개체 속성을 다시 열어주세요.');
      return { available: true as const, capture };
    },
    async apply(capture: ObjectBodyFlowCapture, flow: ObjectBodyFlow) {
      if (!current(capture)) throw Error('개체 속성을 다시 열어주세요.');
      const values = bodyFlowValues(flow, capture.read.observation.flow),
        dispatch = editor.dispatchCommand;
      if (!current(capture)) throw Error('개체 속성을 다시 열어주세요.');
      const issued = captures.get(capture);
      if (!issued) throw Error('개체 속성을 다시 열어주세요.');
      issued.used = true;
      return dispatch.call(editor, SET_OBJECT_BODY_FLOW_COMMAND, {
        target: capture.read.target,
        flow: values,
      });
    },
  };
}
