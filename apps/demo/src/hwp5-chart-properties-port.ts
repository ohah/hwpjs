import type { HeadlessEditor, EditorState } from '@hwpjs/core';
// @ts-ignore Existing read-only owner and resource identity checks.
import {
  currentHwp5ChartTarget,
  hwp5ChartDisplayMatchesTarget,
} from '../../../web/preview/hwp5-chart-resources.mjs';
// @ts-ignore Existing title projection preserves unknown/partial title semantics.
import { chartPreviewTitle } from '../../../web/preview/chart-preview-title.mjs';

type Editor = Pick<HeadlessEditor, 'getEditorState' | 'readResource' | 'registerStateListener'>;
export interface Hwp5ChartPropertiesTarget {
  readonly section: number;
  readonly controlNode: number;
}
const stale = () => Error('차트 또는 문서 상태가 바뀌었습니다. 개체 속성을 다시 열어주세요.');
const tokenKeys = [
  'editorId',
  'documentId',
  'generation',
  'operationRevision',
  'viewRevision',
] as const;
const uint = (n: unknown): n is number =>
  Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 0xffffffff;
function targetCopy(target: Hwp5ChartPropertiesTarget) {
  if (!target || ![Object.prototype, null].includes(Object.getPrototypeOf(target))) throw stale();
  const fields = Object.getOwnPropertyDescriptors(target);
  if (
    Reflect.ownKeys(fields).length !== 2 ||
    !['section', 'controlNode'].every(
      (k) => fields[k] && 'value' in fields[k] && uint(fields[k].value),
    )
  )
    throw stale();
  return Object.freeze({
    section: fields.section.value as number,
    controlNode: fields.controlNode.value as number,
  });
}
export function createHwp5ChartPropertiesPort(editor: Editor) {
  function inspect(target: Hwp5ChartPropertiesTarget) {
    const state = editor.getEditorState();
    const row =
      state.status === 'ready' && state.documentId && !state.historyRecoveryRequired
        ? currentHwp5ChartTarget(state.content, target)
        : null;
    if (!row) throw stale();
    return { state, row };
  }
  function current(observation: {
    state: EditorState;
    target: Hwp5ChartPropertiesTarget;
    token: EditorState['token'];
  }) {
    try {
      const { state } = inspect(observation.target);
      return (
        state === observation.state &&
        tokenKeys.every((k) => state.token[k] === observation.token[k])
      );
    } catch {
      return false;
    }
  }
  return {
    subscribe: (listener: () => void) => editor.registerStateListener(listener),
    current,
    observe(value: Hwp5ChartPropertiesTarget) {
      const target = targetCopy(value),
        { state } = inspect(target);
      return Object.freeze({ state, target, token: Object.freeze({ ...state.token }) });
    },
    async capture(observation: {
      state: EditorState;
      target: Hwp5ChartPropertiesTarget;
      token: EditorState['token'];
    }) {
      if (!current(observation)) throw stale();
      const { row } = inspect(observation.target);
      const reply = await editor.readResource(
        { kind: 'hwp5-chart-display', ...observation.target },
        observation.token,
      );
      if (!current(observation)) throw stale();
      const value = reply.chart as any;
      if (
        reply.error ||
        reply.kind !== 'hwp5-chart-display' ||
        reply.section !== observation.target.section ||
        reply.controlNode !== observation.target.controlNode ||
        reply.historyRevision !== row.historyRevision ||
        !hwp5ChartDisplayMatchesTarget(value, row)
      )
        throw stale();
      const g = value.owner.geometry;
      if (!uint(g?.width) || g.width === 0 || !uint(g.height) || g.height === 0) throw stale();
      const projected = chartPreviewTitle(value.data).title;
      const result = Object.freeze({
        ...observation,
        width: g.width,
        height: g.height,
        title: projected
          ? Object.freeze({
              lines: Object.freeze([...projected.lines]),
              shortened: projected.shortened,
            })
          : null,
      });
      if (!current(observation)) throw stale();
      return result;
    },
  };
}
