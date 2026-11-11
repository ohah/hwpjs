import type {
  EditorCommand,
  EditorState,
  HeadlessEditor,
  EditSourceTableGridPayload,
} from '@hwpjs/core';

import {
  generatedTableGridCommands as sourceTableGridCommands,
  type GeneratedTableGridCommand as SourceTableGridCommand,
} from './generated-table-grid-port.ts';
export type SourceTableGridPayload = Readonly<EditSourceTableGridPayload>;

/** Surface owns source-cell selection, including composition and A→B→A fences. */
export interface SourceTableGridSelection {
  readonly state: EditorState;
  readonly section: number;
  readonly tableNode: number;
  readonly listNode: number;
  readonly row: number;
  readonly column: number;
  readonly rows: number;
  readonly columns: number;
  current(): boolean;
  /** Record only a verified committed SOURCE transition; no separate undo implementation. */
  recordHistory?(
    result: import('@hwpjs/core').CommandResult,
    request: SourceTableGridPayload,
  ): boolean;
}
export interface SourceTableGridHost {
  captureSourceTableGridSelection?(): SourceTableGridSelection | null;
}
export type SourceTableGridCore = {
  EDIT_SOURCE_TABLE_GRID_COMMAND?: EditorCommand<SourceTableGridPayload>;
};
type Cell = Readonly<{
  section: number;
  tableNode: number;
  listNode: number;
  row: number;
  column: number;
  rows: number;
  columns: number;
}>;
export type SourceTableGridCapture = Readonly<{
  state: EditorState;
  cell: Cell | null;
  reason: string | null;
}>;
const uint = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  !Object.is(value, -0) &&
  value >= 0 &&
  value <= 0xffffffff;
export function sourceTableGridReason(code: string) {
  const messages: Record<string, string> = {
    SourceTableGridUnavailable: '현재 엔진은 원본 표의 행·열 변경을 제공하지 않습니다.',
    AmbiguousSourceTableTracks: '병합 셀의 줄 높이·칸 너비를 원본에서 확정할 수 없습니다.',
    ConflictingSourceTableTracks: '원본 셀들의 줄 높이·칸 너비가 서로 맞지 않습니다.',
    SelectSourceTableCell: '지원되는 원본 표의 셀을 선택하세요.',
    SourceTableGridRefreshRequired: '표 변경 뒤 표시 확인이 필요합니다. 다시 적용하지 마세요.',
    SourceTableGridPending: '표의 행·열 변경을 반영하고 있습니다.',
    ReadOnlyDocument: '읽기 전용 문서입니다.',
    EditorNotReady: '문서를 먼저 열어주세요.',
    HistoryRecoveryRequired: '문서를 다시 연 뒤 편집해주세요.',
    StaleSourceTableCell: '선택이나 문서가 바뀌었습니다. 셀을 다시 선택하세요.',
    FinalTableRow: '마지막 행은 삭제할 수 없습니다.',
    FinalTableColumn: '마지막 열은 삭제할 수 없습니다.',
  };
  return messages[code] ?? `원본 표의 행·열을 변경하지 못했습니다. (${code})`;
}
/** Source node addresses remain source addresses; Native owns structural eligibility. */
export function createSourceTableGridPort(
  editor: HeadlessEditor,
  core: SourceTableGridCore,
  getHost: () => SourceTableGridHost | undefined,
) {
  let pending = false,
    disposed = false;
  let refreshRequired: EditorState | undefined;
  const issued = new WeakMap<SourceTableGridCapture, SourceTableGridSelection>();
  const consumed = new WeakSet<SourceTableGridCapture>();
  function capture(ignorePending = false): SourceTableGridCapture {
    const state = editor.getEditorState();
    let cell: Cell | null = null,
      reason: string | null = null;
    let selected: SourceTableGridSelection | null | undefined;
    try {
      if (disposed) throw Error('StaleSourceTableCell');
      if (pending && !ignorePending) throw Error('SourceTableGridPending');
      if (refreshRequired === state) throw Error('SourceTableGridRefreshRequired');
      if (state.status !== 'ready') throw Error('EditorNotReady');
      const content = state.content as any;
      if (state.historyRecoveryRequired) throw Error('HistoryRecoveryRequired');
      if (content?.readOnly === true || (state.capabilities as any)?.readOnly === true)
        throw Error('ReadOnlyDocument');
      const command = core.EDIT_SOURCE_TABLE_GRID_COMMAND;
      if (
        command?.name !== 'source-table-grid' ||
        typeof command.id !== 'symbol' ||
        (state.capabilities as any)?.sourceTableGridAvailable !== true ||
        content?.sourceTableGridAvailable !== true
      )
        throw Error('SourceTableGridUnavailable');
      selected = getHost()?.captureSourceTableGridSelection?.();
      if (!selected || selected.state !== state || selected.current() !== true)
        throw Error('SelectSourceTableCell');
      if (
        !['hwp5', 'hwpx'].includes(content?.format) ||
        content.limited !== false ||
        content.window ||
        content.viewKind ||
        ![
          selected.section,
          selected.tableNode,
          selected.listNode,
          selected.row,
          selected.column,
          selected.rows,
          selected.columns,
        ].every(uint) ||
        !selected.rows ||
        !selected.columns ||
        selected.row >= selected.rows ||
        selected.column >= selected.columns
      )
        throw Error('SelectSourceTableCell');
      cell = Object.freeze({
        section: selected.section,
        tableNode: selected.tableNode,
        listNode: selected.listNode,
        row: selected.row,
        column: selected.column,
        rows: selected.rows,
        columns: selected.columns,
      });
      if (editor.getEditorState() !== state || selected.current() !== true)
        throw Error('StaleSourceTableCell');
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
      cell = null;
    }
    const value = Object.freeze({ state, cell, reason });
    if (selected && !reason) issued.set(value, selected);
    return value;
  }
  function isCurrent(lease: SourceTableGridCapture) {
    const selected = issued.get(lease);
    try {
      return (
        !disposed &&
        refreshRequired !== lease.state &&
        !consumed.has(lease) &&
        !lease.reason &&
        !!lease.cell &&
        !!selected &&
        editor.getEditorState() === lease.state &&
        selected.current() === true &&
        editor.getEditorState() === lease.state
      );
    } catch {
      return false;
    }
  }
  function actionReason(lease: SourceTableGridCapture, command: SourceTableGridCommand) {
    if (!sourceTableGridCommands.includes(command)) return 'InvalidSourceTableGridCommand';
    if (lease.reason) return lease.reason;
    if (!isCurrent(lease)) return 'StaleSourceTableCell';
    if (command === 'generated-table-delete-row' && lease.cell!.rows === 1) return 'FinalTableRow';
    if (command === 'generated-table-delete-column' && lease.cell!.columns === 1)
      return 'FinalTableColumn';
    return null;
  }
  return {
    capture,
    isCurrent,
    presentation() {
      const lease = capture();
      return Object.fromEntries(
        sourceTableGridCommands.map((command) => {
          const reason = actionReason(lease, command);
          return [
            command,
            {
              enabled: !reason,
              surfaceSelection: !reason,
              reason: reason ? sourceTableGridReason(reason) : undefined,
            },
          ];
        }),
      );
    },
    contextTarget() {
      const lease = capture();
      if (!lease.cell || lease.reason) return null;
      return {
        kind: 'source-table-cell' as const,
        key: JSON.stringify([lease.state.token, lease.state.stateVersion, lease.cell]),
        current: () => isCurrent(lease),
      };
    },
    async apply(lease: SourceTableGridCapture, command: SourceTableGridCommand) {
      let admitted = false,
        dispatched = false;
      try {
        if (pending) throw Error('SourceTableGridPending');
        const reason = actionReason(lease, command);
        if (reason) throw Error(reason);
        const c = lease.cell!;
        const action = command.slice('generated-table-'.length) as SourceTableGridPayload['action'];
        const index = action.endsWith('row') ? c.row : c.column;
        // HWP5 Reader bindings use observed8 (table_display_bindings.zig:40/44).
        // HWPX uses spec6 by absence; never infer layout from payload lengths.
        const payload: SourceTableGridPayload = Object.freeze({
          section: c.section,
          tableNode: c.tableNode,
          expectedRows: c.rows,
          expectedColumns: c.columns,
          action,
          index: index + (action.startsWith('insert') ? 1 : 0),
          ...((lease.state.content as any)?.format === 'hwp5'
            ? { layout: 'observed8' as const }
            : {}),
        });
        pending = true;
        admitted = true;
        await editor.update(() => {});
        if (!isCurrent(lease)) throw Error('StaleSourceTableCell');
        const now = capture(true);
        if (now.reason || JSON.stringify(now.cell) !== JSON.stringify(c))
          throw Error(now.reason ?? 'StaleSourceTableCell');
        const definition = core.EDIT_SOURCE_TABLE_GRID_COMMAND;
        if (!definition || !isCurrent(lease)) throw Error('StaleSourceTableCell');
        consumed.add(lease);
        dispatched = true;
        const result = await editor.dispatchCommand(definition, payload);
        // This lease owns the pre-command selection; mutation invalidated current(), not its receipt.
        if (result.status === 'committed-with-snapshot')
          issued.get(lease)?.recordHistory?.(result, payload);
        if (result.status !== 'rejected-unapplied' && result.status !== 'known-no-op')
          refreshRequired = lease.state;
        return result;
      } catch (error) {
        if (dispatched) {
          refreshRequired = lease.state;
          throw error;
        }
        return {
          status: 'rejected-unapplied' as const,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        if (admitted) pending = false;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
export type SourceTableGridPort = ReturnType<typeof createSourceTableGridPort>;
