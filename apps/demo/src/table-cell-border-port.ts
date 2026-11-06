import type { HeadlessEditor, EditorState } from '@hwpjs/core';
import {
  createTableCellPropertiesPort,
  tableCellReason,
  type TableCellCore,
  type TableCellCapture,
} from './table-cell-properties-port.ts';
// @ts-ignore Scalar validation is owned by the runtime wire boundary.
import { validateCellBorder } from '../../../js/cell-border-command.mjs';
// @ts-ignore Existing RGB parser owns exact #RRGGBB validation.
import { characterColorArg } from '../../../js/character-color-args.mjs';

export type TableCellBorderDraft = {
  edges: number;
  style: string;
  width: string;
  color: string;
  dirty: { style: boolean; width: boolean; color: boolean };
};
export type TableCellBorderCapture = Readonly<{
  state: EditorState;
  cell: TableCellCapture['cell'];
  reason: string | null;
  writeReason: string | null;
  currentBorder: null;
}>;
export function tableCellBorderReason(code: string) {
  const messages: Record<string, string> = {
    CellBorderApiUnavailable: '현재 엔진은 셀 테두리 변경을 제공하지 않습니다.',
    CellBorderPending: '셀 테두리를 반영하고 있습니다.',
    CellSizePending: '셀 변경을 반영하고 있습니다.',
    CellMutationApiUnavailable: '현재 엔진은 셀 변경을 제공하지 않습니다.',
    CellBorderChoiceRequired: '선 모양·폭·색을 각각 직접 선택하세요.',
    InvalidCellBorder: '변을 하나 이상 선택하고 선 모양·폭·#RRGGBB 색을 확인하세요.',
    InvalidCellBorderCapture: '선택 또는 문서 상태가 바뀌었습니다. 창을 다시 열어주세요.',
  };
  return messages[code] ?? tableCellReason(code);
}
/** Validate the exact scalar request; no unobserved border values are filled in. */
export function tableCellBorderValues(draft: TableCellBorderDraft) {
  if (draft.dirty?.style !== true || draft.dirty?.width !== true || draft.dirty?.color !== true)
    throw Error('CellBorderChoiceRequired');
  try {
    // Select values encode actual hundredths of a millimetre, never option ordinals.
    if (!/^[1-9][0-9]*$/.test(draft.width)) throw Error('InvalidCellBorder');
    const normalized = validateCellBorder({
      section: 0,
      tableNode: 0,
      listNode: 0,
      edges: draft.edges,
      style: draft.style,
      width: Number(draft.width),
      color: characterColorArg(draft.color),
    });
    return Object.freeze({
      edges: normalized.edges,
      style: normalized.style,
      width: normalized.width,
      color: normalized.color,
    });
  } catch {
    throw Error('InvalidCellBorder');
  }
}
export function createTableCellBorderPort(editor: HeadlessEditor, core: Partial<TableCellCore>) {
  const selection = createTableCellPropertiesPort(editor, core);
  const sources = new WeakMap<TableCellBorderCapture, TableCellCapture>();
  let disposed = false,
    pending = false;
  const writeReason = (state: EditorState) => {
    if (disposed) return 'TableCellDisposed';
    if (state.status !== 'ready') return 'EditorNotReady';
    if ((state.content as { readOnly?: boolean } | null)?.readOnly === true)
      return 'ReadOnlyDocument';
    if (state.historyRecoveryRequired) return 'HistoryRecoveryRequired';
    if ((state.capabilities as { cellBorderAvailable?: boolean })?.cellBorderAvailable !== true)
      return 'CellBorderApiUnavailable';
    return pending ? 'CellBorderPending' : null;
  };
  return {
    capture(): TableCellBorderCapture {
      const source = selection.capture();
      const capture = Object.freeze({
        state: source.state,
        cell: source.cell,
        reason: source.reason,
        writeReason: writeReason(source.state),
        currentBorder: null,
      });
      sources.set(capture, source);
      return capture;
    },
    isCurrent(captured: TableCellBorderCapture) {
      const source = sources.get(captured);
      return !disposed && !!source && selection.isCurrent(source);
    },
    subscribe: selection.subscribe,
    presentation() {
      const state = editor.getEditorState();
      const reason = writeReason(state) ?? (!state.selection ? 'SelectOriginalTableCell' : null);
      return {
        enabled: reason === null,
        reason: reason ? tableCellBorderReason(reason) : undefined,
      };
    },
    async apply(captured: TableCellBorderCapture, draft: TableCellBorderDraft) {
      const source = sources.get(captured);
      if (disposed || pending || !source)
        return {
          status: 'rejected-unapplied' as const,
          error: disposed
            ? 'TableCellDisposed'
            : pending
              ? 'CellBorderPending'
              : 'InvalidCellBorderCapture',
        };
      let values: ReturnType<typeof tableCellBorderValues>;
      try {
        values = tableCellBorderValues(draft);
      } catch (error) {
        return {
          status: 'rejected-unapplied' as const,
          error: error instanceof Error ? error.message : 'InvalidCellBorder',
        };
      }
      pending = true;
      try {
        return await selection.applyCapturedMutation(source, (current) => {
          const reason = writeReason(current.state);
          if (reason && reason !== 'CellBorderPending') return { writeReason: reason };
          const cell = current.cell!;
          const normalized = validateCellBorder({
            section: cell.section,
            tableNode: cell.tableNode,
            listNode: cell.listNode,
            ...values,
          });
          return { message: Object.freeze({ kind: 'cell-border', ...normalized }) };
        });
      } finally {
        pending = false;
      }
    },
    restoreSelection(captured: TableCellBorderCapture, result: unknown) {
      const source = sources.get(captured);
      return source ? selection.restoreSelection(source, result) : Promise.resolve(false);
    },
    dispose() {
      disposed = true;
      selection.dispose();
    },
  };
}
export type TableCellBorderPort = ReturnType<typeof createTableCellBorderPort>;
