import type { HeadlessEditor, EditorState } from '@hwpjs/core';
import {
  createTableCellPropertiesPort,
  tableCellReason,
  type TableCellCore,
  type TableCellCapture,
} from './table-cell-properties-port.ts';
// @ts-ignore Scalar wire validation is shared with the experimental runtime boundary.
import { validateCellBackground } from '../../../js/cell-background-command.mjs';
// @ts-ignore Existing RGB parsing owns #RRGGBB validation.
import { characterColorArg } from '../../../js/character-color-args.mjs';

export type TableCellBackgroundDraft = { color: string; dirty: boolean };
export type TableCellBackgroundCapture = Readonly<{
  state: EditorState;
  cell: TableCellCapture['cell'];
  reason: string | null;
  writeReason: string | null;
  /** No initial fill observation is supplied by this port. Never infer white. */
  currentColor: null;
}>;
export function tableCellBackgroundReason(code: string) {
  const messages: Record<string, string> = {
    CellBackgroundApiUnavailable: '현재 엔진은 셀 배경 변경을 제공하지 않습니다.',
    CellBackgroundPending: '셀 배경을 반영하고 있습니다.',
    CellSizePending: '셀 변경을 반영하고 있습니다.',
    CellMutationApiUnavailable: '현재 엔진은 셀 변경을 제공하지 않습니다.',
    InvalidCellBackgroundColor: '#RRGGBB 형식의 단색을 선택하세요.',
    CellBackgroundChoiceRequired: '적용할 배경색을 직접 선택하세요.',
    InvalidCellBackgroundCapture: '선택 또는 문서 상태가 바뀌었습니다. 창을 다시 열어주세요.',
  };
  return messages[code] ?? tableCellReason(code);
}
export function createTableCellBackgroundPort(
  editor: HeadlessEditor,
  core: Partial<TableCellCore>,
) {
  // Selection membership, immutable fences, queue barrier, consumption and restoration have one owner.
  const selection = createTableCellPropertiesPort(editor, core);
  const sources = new WeakMap<TableCellBackgroundCapture, TableCellCapture>();
  let disposed = false,
    pending = false;
  const writeReason = (state: EditorState) => {
    if (disposed) return 'TableCellDisposed';
    if (state.status !== 'ready') return 'EditorNotReady';
    if ((state.content as { readOnly?: boolean } | null)?.readOnly === true)
      return 'ReadOnlyDocument';
    if (state.historyRecoveryRequired) return 'HistoryRecoveryRequired';
    const caps = state.capabilities as { cellBackgroundAvailable?: boolean };
    if (caps?.cellBackgroundAvailable !== true) return 'CellBackgroundApiUnavailable';
    if (pending) return 'CellBackgroundPending';
    return null;
  };
  return {
    capture(): TableCellBackgroundCapture {
      const source = selection.capture();
      const captured = Object.freeze({
        state: source.state,
        cell: source.cell,
        reason: source.reason,
        writeReason: writeReason(source.state),
        currentColor: null,
      });
      sources.set(captured, source);
      return captured;
    },
    isCurrent(captured: TableCellBackgroundCapture) {
      const source = sources.get(captured);
      return !disposed && !!source && selection.isCurrent(source);
    },
    subscribe: selection.subscribe,
    presentation() {
      const state = editor.getEditorState();
      const reason = writeReason(state) ?? (!state.selection ? 'SelectOriginalTableCell' : null);
      return {
        enabled: reason === null,
        reason: reason ? tableCellBackgroundReason(reason) : undefined,
      };
    },
    async apply(captured: TableCellBackgroundCapture, draft: TableCellBackgroundDraft) {
      const source = sources.get(captured);
      if (disposed || pending || !source)
        return {
          status: 'rejected-unapplied' as const,
          error: disposed
            ? 'TableCellDisposed'
            : pending
              ? 'CellBackgroundPending'
              : 'InvalidCellBackgroundCapture',
        };
      let color: number;
      try {
        if (draft.dirty !== true) throw Error('CellBackgroundChoiceRequired');
        color = characterColorArg(draft.color);
      } catch (error) {
        return {
          status: 'rejected-unapplied' as const,
          error:
            error instanceof Error && error.message === 'CellBackgroundChoiceRequired'
              ? error.message
              : 'InvalidCellBackgroundColor',
        };
      }
      pending = true;
      try {
        return await selection.applyCapturedMutation(source, (current) => {
          const reason = writeReason(current.state);
          if (reason && reason !== 'CellBackgroundPending') return { writeReason: reason };
          const cell = current.cell!;
          const normalized = validateCellBackground({
            section: cell.section,
            tableNode: cell.tableNode,
            listNode: cell.listNode,
            color,
          });
          return { message: Object.freeze({ kind: 'cell-background', ...normalized }) };
        });
      } finally {
        pending = false;
      }
    },
    restoreSelection(captured: TableCellBackgroundCapture, result: unknown) {
      const source = sources.get(captured);
      return source ? selection.restoreSelection(source, result) : Promise.resolve(false);
    },
    dispose() {
      disposed = true;
      selection.dispose();
    },
  };
}
export type TableCellBackgroundPort = ReturnType<typeof createTableCellBackgroundPort>;
