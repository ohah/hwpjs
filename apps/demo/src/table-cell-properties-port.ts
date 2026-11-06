// @ts-ignore Canonical structured cell-style mutation validation.
import { validateCellStylesMessage } from '../../../js/cell-style-command.mjs';
// @ts-ignore Structured cell payload admission shares the SDK wire validators.
import { validateCellAppearanceMessage } from '../../../js/cell-appearance-command.mjs';
// @ts-ignore Batch shape admission is shared with Native transport.
import { validateCellBordersMessage } from '../../../js/cell-border-batch.mjs';
import type { HeadlessEditor, EditorState, SelectionTarget } from '@hwpjs/core';
import { exactParagraphNumber } from './paragraph-shape-number.ts';
// @ts-ignore 기존 Native 호출 계획을 표시 적격성에도 재사용한다.
import { tableColumnWidthPlan } from '../../../web/preview/table-column-width-plan.mjs';
// @ts-ignore wire 인자 검증의 SSOT만 재사용하며 JS에서 Native 명령을 실행하지 않는다.
import { encodeCellSizes } from '../../../js/cell-size-batch.mjs';
const invokeRequest = Reflect.apply;

export type TableCellCore = Pick<
  typeof import('@hwpjs/core'),
  'getSelectionFormatting' | 'createParagraphSelection'
>;
export type TableCellDraft = {
  widthPoints: string;
  heightPoints: string;
  mode: 'cell' | 'column';
  dirty?: { width: boolean; height: boolean };
};
export type TableCellCapture = Readonly<{
  state: EditorState;
  target: SelectionTarget | null;
  cell: Readonly<{
    section: number;
    tableNode: number;
    listNode: number;
    width: number;
    height: number;
    row: number;
    column: number;
  }> | null;
  reason: string | null;
  writeReason: string | null;
  columnAvailable: boolean;
  columnReason: string | null;
}>;
const uint = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
export function tableCellReason(code: string) {
  const messages: Record<string, string> = {
    ReadOnlyDocument: '읽기 전용 문서입니다. 원값만 확인할 수 있습니다.',
    HistoryRecoveryRequired: '문서를 다시 연 뒤 편집해주세요.',
    CellSizeApiUnavailable: '현재 엔진은 셀 크기 변경을 제공하지 않습니다.',
    CellSizeBatchApiUnavailable: '현재 엔진은 공유 열 경계 변경을 제공하지 않습니다.',
    CellSizePending: '셀 크기를 반영하고 있습니다.',
    StaleTableCellSelection: '선택 또는 문서 상태가 바뀌었습니다. 창을 다시 열어주세요.',
    FullTableObservationRequired: '전체 표 관측이 준비된 문서에서 사용할 수 있습니다.',
    SelectOriginalTableCell: '문서에서 원본 표 셀을 선택하세요.',
    OriginalTableCellRequired: '현재 선택은 지원하는 원본 표 셀이 아닙니다.',
    EditorNotReady: '문서를 먼저 열어주세요.',
    InvalidCellDimensions: '셀 크기를 허용 범위의 정확한 pt 값으로 입력하세요.',
  };
  return messages[code] ?? '현재 셀 속성을 사용할 수 없습니다. (' + code + ')';
}
export function tableCellDimensions(
  draft: TableCellDraft,
  original?: { width: number; height: number },
) {
  const width =
    draft.dirty?.width === false && original
      ? original.width
      : exactParagraphNumber(draft.widthPoints, 100);
  const height =
    draft.dirty?.height === false && original
      ? original.height
      : exactParagraphNumber(draft.heightPoints, 100);
  if (
    !uint(width) ||
    !uint(height) ||
    (draft.mode === 'column' && width === 0) ||
    !['cell', 'column'].includes(draft.mode)
  )
    throw Error('InvalidCellDimensions');
  return { width, height };
}
/** 공개 선택과 현재 DTO의 연결만 확인한다. Native 참조나 선택 owner를 발급하지 않는다. */
export function createTableCellPropertiesPort(
  editor: HeadlessEditor,
  core: Partial<TableCellCore>,
) {
  let disposed = false,
    pending = false;
  const issued = new WeakSet<TableCellCapture>();
  const consumed = new WeakSet<TableCellCapture>();
  const tablesByCapture = new WeakMap<TableCellCapture, unknown>();
  const tokenKeys = [
    'editorId',
    'documentId',
    'generation',
    'operationRevision',
    'viewRevision',
  ] as const;
  const targetKeys = ['section', 'paragraph', 'startUnit', 'endUnit', 'owner', 'affinity'] as const;
  // 비교용 scalar 사본이며 명령 target이나 Native 권위를 발급하는 객체가 아니다.
  const fences = new WeakMap<
    TableCellCapture,
    {
      version: number;
      token: readonly unknown[];
      target: readonly unknown[] | null;
      selection: readonly unknown[] | null;
    }
  >();
  const selectedValues = (value: unknown) =>
    value && typeof value === 'object'
      ? targetKeys.map((k) => (value as Record<string, unknown>)[k])
      : null;
  const sameValues = (a: readonly unknown[] | null, b: readonly unknown[] | null) =>
    a === null || b === null ? a === b : a.length === b.length && a.every((v, i) => v === b[i]);
  function assertCurrent(captured: TableCellCapture) {
    const current = editor.getEditorState(),
      fence = fences.get(captured);
    if (disposed || !fence || current !== captured.state || current.stateVersion !== fence.version)
      throw Error('StaleTableCellSelection');
    const token = current.token,
      selection = selectedValues(current.selection);
    if (
      !sameValues(
        fence.token,
        tokenKeys.map((k) => token[k]),
      ) ||
      !sameValues(fence.selection, selection) ||
      disposed ||
      editor.getEditorState() !== current
    )
      throw Error('StaleTableCellSelection');
  }
  const sameCapture = (a: TableCellCapture, b: TableCellCapture) =>
    a.state === b.state &&
    a.cell !== null &&
    b.cell !== null &&
    a.target !== null &&
    b.target !== null &&
    (['section', 'tableNode', 'listNode', 'width', 'height', 'row', 'column'] as const).every(
      (k) => a.cell![k] === b.cell![k],
    ) &&
    sameValues(fences.get(a)?.target ?? null, fences.get(b)?.target ?? null);
  function capture(): TableCellCapture {
    const state = editor.getEditorState();
    let target: SelectionTarget | null = null,
      cell: TableCellCapture['cell'] = null;
    let tableForCapture: unknown;
    let reason: string | null = null,
      writeReason: string | null = null,
      columnAvailable = false,
      columnReason: string | null = null;
    try {
      if (disposed) throw Error('TableCellDisposed');
      if (state.status !== 'ready') throw Error('EditorNotReady');
      if (
        typeof core.getSelectionFormatting !== 'function' ||
        typeof core.createParagraphSelection !== 'function'
      )
        throw Error('TableSelectionApiUnavailable');
      const content = state.content as any;
      if (
        !content ||
        !['hwp5', 'hwpx'].includes(content.format) ||
        content.limited !== false ||
        content.window ||
        content.viewKind
      )
        throw Error('FullTableObservationRequired');
      target = core.getSelectionFormatting(state).target;
      if (!target) throw Error('SelectOriginalTableCell');
      const rows = content.paragraphs?.filter(
        (p: any) => p.section === target!.section && p.paragraph === target!.paragraph,
      );
      if (!Array.isArray(rows) || rows.length !== 1) throw Error('AmbiguousCellParagraph');
      const row = rows[0],
        binding = row.tableCell;
      if (
        !binding ||
        !uint(binding.tableNode) ||
        !uint(binding.listNode) ||
        row.clipped ||
        row.sourceOffsets
      )
        throw Error('OriginalTableCellRequired');
      if (content.format === 'hwp5' && row.currentReference?.kind !== 'original')
        throw Error('OriginalTableCellRequired');
      const tables = content.tables?.filter(
        (t: any) => t.section === target!.section && t.tableNode === binding.tableNode,
      );
      if (!Array.isArray(tables) || tables.length !== 1 || tables[0].partial)
        throw Error('CompleteOriginalTableRequired');
      tableForCapture = tables[0];
      const cells = tables[0].cells?.filter((c: any) => c.listNode === binding.listNode);
      if (!Array.isArray(cells) || cells.length !== 1) throw Error('AmbiguousTableCell');
      const selected = cells[0];
      if (
        !Array.isArray(selected.paragraphs) ||
        !selected.paragraphs.includes(target.paragraph) ||
        ![selected.width, selected.height, selected.row, selected.column].every(uint)
      )
        throw Error('InvalidCellObservation');
      cell = Object.freeze({
        section: target.section,
        tableNode: binding.tableNode,
        listNode: binding.listNode,
        width: selected.width,
        height: selected.height,
        row: selected.row,
        column: selected.column,
      });
      const caps = state.capabilities as any;
      if (caps?.cellSizeBatchAvailable !== true) columnReason = 'CellSizeBatchApiUnavailable';
      else {
        const plan = tableColumnWidthPlan(tables[0], {
          section: cell.section,
          tableNode: cell.tableNode,
          listNode: cell.listNode,
          width: cell.width,
          expectedWidth: cell.width,
        });
        columnAvailable = plan.state === 'planned';
        if (!columnAvailable) columnReason = plan.error;
      }
      writeReason =
        content.readOnly === true
          ? 'ReadOnlyDocument'
          : state.historyRecoveryRequired
            ? 'HistoryRecoveryRequired'
            : caps?.cellSizeAvailable !== true
              ? 'CellSizeApiUnavailable'
              : typeof editor.requestExperimental !== 'function'
                ? 'CellSizeApiUnavailable'
                : pending
                  ? 'CellSizePending'
                  : null;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    const value = Object.freeze({
      state,
      target,
      cell,
      reason,
      writeReason,
      columnAvailable,
      columnReason,
    });
    issued.add(value);
    const token = state.token;
    fences.set(value, {
      version: state.stateVersion,
      token: tokenKeys.map((k) => token[k]),
      target: target ? targetKeys.map((k) => target![k]) : null,
      selection: selectedValues(state.selection),
    });
    if (!reason && tableForCapture) tablesByCapture.set(value, tableForCapture);
    return value;
  }
  /** App-internal single mutation admission; selection authority remains in capture(). */
  async function applyCapturedMutation(
    captured: TableCellCapture,
    build: (current: TableCellCapture) => {
      message?: Readonly<Record<string, unknown>>;
      writeReason?: string | null;
      noOp?: boolean;
    },
  ) {
    let admitted = false,
      dispatched = false;
    const writable = () => {
      assertCurrent(captured);
      if (captured.state.status !== 'ready') throw Error('EditorNotReady');
      if ((captured.state.content as { readOnly?: boolean } | null)?.readOnly === true)
        throw Error('ReadOnlyDocument');
      if (captured.state.historyRecoveryRequired) throw Error('HistoryRecoveryRequired');
      assertCurrent(captured);
    };
    const planFor = (now: TableCellCapture) => {
      writable();
      const plan = build(now);
      writable();
      if (plan.writeReason) throw Error(plan.writeReason);
      return plan;
    };
    const freezeMessage = (value: Readonly<Record<string, unknown>> | undefined) => {
      if (!value) throw Error('InvalidTableCellMutation');
      const result: Record<string, unknown> = {};
      for (const key of Reflect.ownKeys(value)) {
        writable();
        if (typeof key !== 'string' || key === '__proto__') throw Error('InvalidTableCellMutation');
        const field = value[key];
        writable();
        result[key] = field;
      }
      if (result.kind === 'cell-styles') {
        const normalized = validateCellStylesMessage(result);
        writable();
        return normalized;
      }
      if (result.kind === 'cell-appearance') {
        const normalized = validateCellAppearanceMessage(result);
        writable();
        return normalized;
      }
      if (result.kind === 'cell-borders') {
        const cells = validateCellBordersMessage(result);
        writable();
        return Object.freeze({ kind: 'cell-borders', cells });
      }
      for (const field of Object.values(result))
        if (typeof field !== 'string' && (typeof field !== 'number' || !Number.isFinite(field)))
          throw Error('InvalidTableCellMutation');
      return Object.freeze(result);
    };
    try {
      if (
        disposed ||
        pending ||
        !issued.has(captured) ||
        consumed.has(captured) ||
        captured.reason ||
        !captured.cell
      )
        throw Error(
          disposed ? 'TableCellDisposed' : pending ? 'CellSizePending' : 'InvalidTableCellCapture',
        );
      writable();
      const now = capture();
      writable();
      if (now.reason) throw Error(now.reason);
      if (!sameCapture(captured, now)) throw Error('StaleTableCellSelection');
      const initial = planFor(now);
      if (initial.noOp) return { status: 'known-no-op' as const };
      const message = freezeMessage(initial.message);
      const fingerprint = JSON.stringify(message);
      pending = true;
      admitted = true;
      await editor.update(() => {});
      writable();
      const final = capture();
      writable();
      if (!sameCapture(captured, final) || final.reason) throw Error('StaleTableCellSelection');
      const finalPlan = planFor(final);
      if (finalPlan.noOp || JSON.stringify(freezeMessage(finalPlan.message)) !== fingerprint)
        throw Error('StaleTableCellSelection');
      // Property getters may reenter: validate before reading send/token and again before dispatch.
      writable();
      const send = editor.requestExperimental;
      const requestOptions = Object.freeze({
        mutation: true,
        token: Object.freeze({ ...captured.state.token }),
      });
      const requestArguments = [message, requestOptions] as const;
      writable();
      if (typeof send !== 'function') throw Error('CellMutationApiUnavailable');
      const lastPlan = planFor(final);
      if (lastPlan.noOp || JSON.stringify(freezeMessage(lastPlan.message)) !== fingerprint)
        throw Error('StaleTableCellSelection');
      writable();
      dispatched = true;
      consumed.add(captured);
      const result: Awaited<ReturnType<typeof editor.requestExperimental>> = await invokeRequest(
        send,
        editor,
        requestArguments,
      );
      if (
        'status' in result &&
        (result.status === 'rejected-unapplied' || result.status === 'known-no-op')
      )
        consumed.delete(captured);
      return result;
    } catch (error) {
      if (dispatched) throw error;
      return {
        status: 'rejected-unapplied' as const,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (admitted) pending = false;
    }
  }
  return {
    capture,
    isCurrent(captured: TableCellCapture) {
      if (!issued.has(captured) || consumed.has(captured)) return false;
      try {
        assertCurrent(captured);
        const now = capture();
        assertCurrent(captured);
        return !now.reason && sameCapture(captured, now);
      } catch {
        return false;
      }
    },
    subscribe: (listener: (state: EditorState) => void) => editor.registerStateListener(listener),
    // 닫힌 창의 표시 경로에는 문단·표 검색이나 서식 조회를 추가하지 않는다.
    presentation() {
      const state = editor.getEditorState();
      const enabled = !disposed && !pending && state.status === 'ready' && !!state.selection;
      return { enabled, reason: enabled ? undefined : '문서의 표 셀을 선택하세요.' };
    },
    applyCapturedMutation,
    apply(captured: TableCellCapture, draft: TableCellDraft) {
      let message: Record<string, string | number> | undefined;
      return applyCapturedMutation(captured, (now) => {
        const caps = now.state.capabilities as { cellSizeAvailable?: boolean };
        const writeReason =
          caps?.cellSizeAvailable !== true
            ? 'CellSizeApiUnavailable'
            : now.writeReason === 'CellSizePending'
              ? null
              : now.writeReason;
        if (writeReason) return { writeReason };
        if (draft.mode === 'column' && !now.columnAvailable)
          return { writeReason: now.columnReason ?? 'CellSizeBatchApiUnavailable' };
        const selected = captured.cell!;
        if (!message) {
          const { width, height } = tableCellDimensions(draft, selected);
          if (width === selected.width && height === selected.height) return { noOp: true };
          message =
            draft.mode === 'column'
              ? {
                  kind: 'table-column-width',
                  section: selected.section,
                  tableNode: selected.tableNode,
                  listNode: selected.listNode,
                  width,
                  expectedWidth: selected.width,
                  ...(height !== selected.height
                    ? { height, expectedHeight: selected.height }
                    : {}),
                }
              : {
                  kind: 'cell-size',
                  section: selected.section,
                  listNode: selected.listNode,
                  width,
                  height,
                };
        }
        if (message.kind === 'table-column-width') {
          const plan = tableColumnWidthPlan(tablesByCapture.get(now), message);
          if (plan.state !== 'planned') throw Error(plan.error);
          encodeCellSizes(plan.cells);
        } else
          encodeCellSizes([
            {
              section: message.section,
              listNode: message.listNode,
              width: message.width,
              height: message.height,
            },
          ]);
        return { message };
      });
    },
    async restoreSelection(captured: TableCellCapture, result: unknown) {
      const reply = result as any,
        now = editor.getEditorState(),
        before = captured.state;
      if (
        disposed ||
        !issued.has(captured) ||
        !consumed.has(captured) ||
        reply?.status !== 'committed-with-snapshot' ||
        reply.state !== now ||
        !captured.target ||
        now.status !== 'ready' ||
        now.selection ||
        now.editorId !== before.editorId ||
        now.documentId !== before.documentId ||
        now.generation !== before.generation
      )
        return false;
      try {
        const t = captured.target;
        const target = core.createParagraphSelection!(now, {
          section: t.section,
          paragraph: t.paragraph,
          startUnit: t.startUnit,
          endUnit: t.endUnit,
          affinity: t.affinity,
        });
        if (editor.getEditorState() !== now) return false;
        await editor.setSelection(target, { stateVersion: now.stateVersion });
        return !disposed;
      } catch {
        return false;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
export type TableCellPropertiesPort = ReturnType<typeof createTableCellPropertiesPort>;
