import type { HeadlessEditor, EditorState } from '@hwpjs/core';
import {
  createTableCellPropertiesPort,
  tableCellReason,
  type TableCellCore,
  type TableCellCapture,
} from './table-cell-properties-port.ts';
import { tableCellBorderValues, type TableCellBorderDraft } from './table-cell-border-port.ts';
// @ts-ignore The shared planner owns rectangle coverage, merged boundaries and per-cell edges.
import { tableBorderPlan } from '../../../js/table-border-plan.mjs';
// @ts-ignore The runtime boundary owns exact batch/background wire validation.
import { validateCellAppearance } from '../../../js/cell-appearance-command.mjs';
// @ts-ignore Existing RGB parsing owns #RRGGBB validation.
import { characterColorArg } from '../../../js/character-color-args.mjs';

export type TableCellAppearanceDraft = {
  border:
    | (TableCellBorderDraft & {
        mode: 'cell' | 'range' | 'table';
        region: 'outer' | 'inner' | 'all';
        startRow: string;
        endRow: string;
        startColumn: string;
        endColumn: string;
      })
    | null;
  background: { color: string; dirty: boolean } | null;
};
export type TableCellAppearanceCapture = Readonly<{
  state: EditorState;
  cell: TableCellCapture['cell'];
  reason: string | null;
  writeReason: string | null;
  currentBorder: null;
  currentColor: null;
}>;
export function tableCellAppearanceReason(code: string) {
  const messages: Record<string, string> = {
    CellAppearanceApiUnavailable: '현재 엔진은 셀 테두리/배경 변경을 제공하지 않습니다.',
    CellAppearancePending: '셀 테두리/배경을 반영하고 있습니다.',
    CellAppearanceChoiceRequired: '바꿀 테두리 또는 배경을 선택하세요.',
    CellBorderChoiceRequired: '선 종류·굵기·색을 각각 직접 선택하세요.',
    InvalidCellBorder: '변을 하나 이상 선택하고 선 종류·굵기·색을 확인하세요.',
    InvalidCellAppearance: '테두리/배경 입력을 확인하세요.',
    InvalidCellAppearanceCapture: '선택 또는 문서 상태가 바뀌었습니다. 창을 다시 열어주세요.',
    InvalidCellRange:
      '줄·칸 범위를 1 이상의 정수로 입력하세요. 시작 번호는 끝 번호 이하여야 합니다.',
    CompleteOriginalTableRequired: '전체 표 정보를 확인할 수 있는 원본 셀을 선택하세요.',
    InvalidOriginalTableCell: '원본 셀 정보를 확인할 수 없어 범위를 적용하지 못했습니다.',
    UnsupportedTableCoverage: '표 구조를 확인할 수 없어 범위를 적용하지 못했습니다.',
    UnsupportedCellRangeCoverage: '빈 영역이나 겹침이 있는 셀 범위는 지원하지 않습니다.',
    MergedCellBoundaryUnsupported: '병합 셀의 중간을 자르는 범위는 지원하지 않습니다.',
    ProtectedCell: '보호된 셀에는 적용할 수 없습니다.',
    BulkCellBackgroundUnsupported:
      '배경은 현재 셀에만 적용할 수 있습니다. 범위 변경 시 배경 변경을 해제하세요.',
    InvalidCellBackgroundColor: '#RRGGBB 형식의 단색을 선택하세요.',
    EmptyCellBorderRegion: '이 범위에는 적용할 안쪽 테두리가 없습니다.',
    LimitExceeded: '한 번에 변경할 수 있는 셀 수를 초과했습니다.',
  };
  return messages[code] ?? tableCellReason(code);
}
function tableFor(captured: TableCellAppearanceCapture) {
  const cell = captured.cell;
  if (!cell || captured.reason) throw Error('InvalidCellAppearanceCapture');
  const content = captured.state.content as {
    tables?: { section: number; tableNode: number }[];
  } | null;
  const matches = content?.tables?.filter(
    (t) => t.section === cell.section && t.tableNode === cell.tableNode,
  );
  if (!matches || matches.length !== 1) throw Error('CompleteOriginalTableRequired');
  return matches[0];
}
const oneBased = (text: string) => {
  if (typeof text !== 'string' || !/^[1-9][0-9]*$/.test(text)) throw Error('InvalidCellRange');
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > 0xffffffff) throw Error('InvalidCellRange');
  return value;
};
/** Pure UI-to-wire plan. Source observations never issue selection authority. */
export function tableCellAppearanceValues(
  draft: TableCellAppearanceDraft,
  captured: TableCellAppearanceCapture,
) {
  const cell = captured.cell;
  if (!cell || captured.reason) throw Error('InvalidCellAppearanceCapture');
  if (!draft.border && !draft.background) throw Error('CellAppearanceChoiceRequired');
  if (draft.background && draft.border && draft.border.mode !== 'cell')
    throw Error('BulkCellBackgroundUnsupported');
  let cells: readonly unknown[] = [];
  if (draft.border) {
    const border = draft.border;
    const normalized = tableCellBorderValues(border);
    const request = {
      section: cell.section,
      tableNode: cell.tableNode,
      listNode: cell.listNode,
      mode: border.mode,
      region: border.region,
      style: normalized.style,
      width: normalized.width,
      color: normalized.color,
      ...(border.mode === 'range'
        ? {
            range: {
              rowStart: oneBased(border.startRow) - 1,
              rowEnd: oneBased(border.endRow),
              columnStart: oneBased(border.startColumn) - 1,
              columnEnd: oneBased(border.endColumn),
            },
          }
        : {}),
    };
    const plan = tableBorderPlan(tableFor(captured), request);
    if (plan.state !== 'planned') throw Error(plan.error);
    if (!plan.cells.length) throw Error('EmptyCellBorderRegion');
    cells =
      border.mode === 'cell'
        ? plan.cells.map((value: Record<string, unknown>) => ({
            ...value,
            edges: normalized.edges,
          }))
        : plan.cells;
  }
  let background = null;
  if (draft.background) {
    if (draft.background.dirty !== true) throw Error('CellAppearanceChoiceRequired');
    let color;
    try {
      color = characterColorArg(draft.background.color);
    } catch {
      throw Error('InvalidCellBackgroundColor');
    }
    background = {
      section: cell.section,
      tableNode: cell.tableNode,
      listNode: cell.listNode,
      color,
    };
  }
  return validateCellAppearance({ cells, background });
}
export function createTableCellAppearancePort(
  editor: HeadlessEditor,
  core: Partial<TableCellCore>,
) {
  const selection = createTableCellPropertiesPort(editor, core);
  const sources = new WeakMap<TableCellAppearanceCapture, TableCellCapture>();
  let disposed = false,
    pending = false;
  const writeReason = (state: EditorState) => {
    if (disposed) return 'TableCellDisposed';
    if (state.status !== 'ready') return 'EditorNotReady';
    if ((state.content as { readOnly?: boolean } | null)?.readOnly === true)
      return 'ReadOnlyDocument';
    if (state.historyRecoveryRequired) return 'HistoryRecoveryRequired';
    if (
      (state.capabilities as { cellAppearanceAvailable?: boolean })?.cellAppearanceAvailable !==
      true
    )
      return 'CellAppearanceApiUnavailable';
    if (typeof editor.requestExperimental !== 'function') return 'CellAppearanceApiUnavailable';
    return pending ? 'CellAppearancePending' : null;
  };
  return {
    capture(): TableCellAppearanceCapture {
      const source = selection.capture();
      const captured = Object.freeze({
        state: source.state,
        cell: source.cell,
        reason: source.reason,
        writeReason: writeReason(source.state),
        currentBorder: null,
        currentColor: null,
      });
      sources.set(captured, source);
      return captured;
    },
    isCurrent(captured: TableCellAppearanceCapture) {
      const source = sources.get(captured);
      return !disposed && !!source && selection.isCurrent(source);
    },
    subscribe: selection.subscribe,
    presentation() {
      const state = editor.getEditorState();
      const reason = writeReason(state) ?? (!state.selection ? 'SelectOriginalTableCell' : null);
      return {
        enabled: reason === null,
        reason: reason ? tableCellAppearanceReason(reason) : undefined,
      };
    },
    async apply(captured: TableCellAppearanceCapture, draft: TableCellAppearanceDraft) {
      const source = sources.get(captured);
      if (disposed || pending || !source)
        return {
          status: 'rejected-unapplied' as const,
          error: disposed
            ? 'TableCellDisposed'
            : pending
              ? 'CellAppearancePending'
              : 'InvalidCellAppearanceCapture',
        };
      let values: ReturnType<typeof tableCellAppearanceValues>;
      try {
        values = tableCellAppearanceValues(draft, captured);
      } catch (error) {
        return {
          status: 'rejected-unapplied' as const,
          error: error instanceof Error ? error.message : 'InvalidCellAppearance',
        };
      }
      // Snapshot all user draft scalars before waiting at the shared admission barrier.
      const fixed: TableCellAppearanceDraft = {
        border: draft.border ? { ...draft.border, dirty: { ...draft.border.dirty } } : null,
        background: draft.background ? { ...draft.background } : null,
      };
      const fingerprint = JSON.stringify(values);
      pending = true;
      try {
        return await selection.applyCapturedMutation(source, (current) => {
          const reason = writeReason(current.state);
          if (reason && reason !== 'CellAppearancePending') return { writeReason: reason };
          const checked = tableCellAppearanceValues(fixed, {
            state: current.state,
            cell: current.cell,
            reason: current.reason,
            writeReason: null,
            currentBorder: null,
            currentColor: null,
          });
          if (JSON.stringify(checked) !== fingerprint)
            return { writeReason: 'StaleTableCellSelection' };
          return { message: Object.freeze({ kind: 'cell-appearance', ...values }) };
        });
      } finally {
        pending = false;
      }
    },
    restoreSelection(captured: TableCellAppearanceCapture, result: unknown) {
      const source = sources.get(captured);
      return source ? selection.restoreSelection(source, result) : Promise.resolve(false);
    },
    dispose() {
      disposed = true;
      selection.dispose();
    },
  };
}
export type TableCellAppearancePort = ReturnType<typeof createTableCellAppearancePort>;
