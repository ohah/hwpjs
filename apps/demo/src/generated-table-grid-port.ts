import type { EditorCommand, EditorState, HeadlessEditor } from '@hwpjs/core';

export const generatedTableGridCommands = [
  'generated-table-insert-row',
  'generated-table-delete-row',
  'generated-table-insert-column',
  'generated-table-delete-column',
] as const;
export type GeneratedTableGridCommand = (typeof generatedTableGridCommands)[number];
export type GeneratedTableGridPayload = Readonly<{
  section: number;
  identity: string;
  action: 'insert-row' | 'delete-row' | 'insert-column' | 'delete-column';
  index: number;
}>;
/** Surface owns generated-cell selection, including composition and A→B→A fences. */
export interface GeneratedTableGridSelection {
  readonly state: EditorState;
  readonly section: number;
  readonly createdCell: Readonly<{ identity: string; row: number; column: number }>;
  current(): boolean;
}
export interface GeneratedTableGridHost {
  captureGeneratedTableGridSelection?(): GeneratedTableGridSelection | null;
}
export type GeneratedTableGridCore = {
  EDIT_CREATED_TABLE_GRID_COMMAND?: EditorCommand<GeneratedTableGridPayload>;
};
type Cell = Readonly<{
  section: number;
  identity: string;
  row: number;
  column: number;
  rows: number;
  columns: number;
}>;
export type GeneratedTableGridCapture = Readonly<{
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
const identity = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[1-9][0-9]{0,19}$/.test(value) &&
  BigInt(value) <= 18446744073709551615n;
export function generatedTableGridReason(code: string) {
  const messages: Record<string, string> = {
    GeneratedTableGridUnavailable: '현재 엔진은 생성 표의 행·열 변경을 제공하지 않습니다.',
    SelectGeneratedTableCell: '이 세션에서 만든 표의 셀을 선택하세요.',
    GeneratedTableGridPending: '표의 행·열 변경을 반영하고 있습니다.',
    ReadOnlyDocument: '읽기 전용 문서입니다.',
    EditorNotReady: '문서를 먼저 열어주세요.',
    HistoryRecoveryRequired: '문서를 다시 연 뒤 편집해주세요.',
    StaleGeneratedTableCell: '선택이나 문서가 바뀌었습니다. 셀을 다시 선택하세요.',
    FinalTableRow: '마지막 행은 삭제할 수 없습니다.',
    FinalTableColumn: '마지막 열은 삭제할 수 없습니다.',
  };
  return messages[code] ?? '현재 선택에서 생성 표의 행·열을 변경할 수 없습니다.';
}
/** No source table IDs, instance IDs or synthetic paragraph ordinals become identities. */
export function createGeneratedTableGridPort(
  editor: HeadlessEditor,
  core: GeneratedTableGridCore,
  getHost: () => GeneratedTableGridHost | undefined,
) {
  let pending = false,
    disposed = false;
  const issued = new WeakMap<GeneratedTableGridCapture, GeneratedTableGridSelection>();
  const consumed = new WeakSet<GeneratedTableGridCapture>();
  function capture(ignorePending = false): GeneratedTableGridCapture {
    const state = editor.getEditorState();
    let cell: Cell | null = null,
      reason: string | null = null;
    let selected: GeneratedTableGridSelection | null | undefined;
    try {
      if (disposed) throw Error('StaleGeneratedTableCell');
      if (pending && !ignorePending) throw Error('GeneratedTableGridPending');
      if (state.status !== 'ready') throw Error('EditorNotReady');
      const content = state.content as any;
      if (state.historyRecoveryRequired) throw Error('HistoryRecoveryRequired');
      if (content?.readOnly === true) throw Error('ReadOnlyDocument');
      const command = core.EDIT_CREATED_TABLE_GRID_COMMAND;
      if (
        command?.name !== 'created-table-grid' ||
        typeof command.id !== 'symbol' ||
        (state.capabilities as any)?.createdTableGridAvailable !== true
      )
        throw Error('GeneratedTableGridUnavailable');
      selected = getHost()?.captureGeneratedTableGridSelection?.();
      if (!selected || selected.state !== state || selected.current() !== true)
        throw Error('SelectGeneratedTableCell');
      const address = selected.createdCell;
      if (
        !uint(selected.section) ||
        !identity(address?.identity) ||
        !uint(address.row) ||
        !uint(address.column)
      )
        throw Error('SelectGeneratedTableCell');
      if (
        !['hwp5', 'hwpx'].includes(content?.format) ||
        content.limited !== false ||
        content.window ||
        content.viewKind
      )
        throw Error('SelectGeneratedTableCell');
      const tables = content.createdTables?.filter(
        (table: any) => table.section === selected!.section && table.identity === address.identity,
      );
      if (!Array.isArray(tables) || tables.length !== 1) throw Error('SelectGeneratedTableCell');
      const table = tables[0];
      if (
        !uint(table.rows) ||
        !uint(table.columns) ||
        !table.rows ||
        !table.columns ||
        table.partial ||
        address.row >= table.rows ||
        address.column >= table.columns ||
        !Array.isArray(table.cells) ||
        table.cells.length !== table.rows * table.columns ||
        !table.cells.every(
          (c: any, i: number) =>
            c.row === Math.floor(i / table.columns) &&
            c.column === i % table.columns &&
            (c.rowSpan === undefined || c.rowSpan === 1) &&
            (c.columnSpan === undefined || c.columnSpan === 1),
        )
      )
        throw Error('SelectGeneratedTableCell');
      cell = Object.freeze({
        section: selected.section,
        identity: address.identity,
        row: address.row,
        column: address.column,
        rows: table.rows,
        columns: table.columns,
      });
      if (editor.getEditorState() !== state || selected.current() !== true)
        throw Error('StaleGeneratedTableCell');
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
      cell = null;
    }
    const value = Object.freeze({ state, cell, reason });
    if (selected && !reason) issued.set(value, selected);
    return value;
  }
  function isCurrent(lease: GeneratedTableGridCapture) {
    const selected = issued.get(lease);
    try {
      return (
        !disposed &&
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
  function actionReason(lease: GeneratedTableGridCapture, command: GeneratedTableGridCommand) {
    if (!generatedTableGridCommands.includes(command)) return 'InvalidGeneratedTableGridCommand';
    if (lease.reason) return lease.reason;
    if (!isCurrent(lease)) return 'StaleGeneratedTableCell';
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
        generatedTableGridCommands.map((command) => {
          const reason = actionReason(lease, command);
          return [
            command,
            {
              enabled: !reason,
              surfaceSelection: !reason,
              reason: reason ? generatedTableGridReason(reason) : undefined,
            },
          ];
        }),
      );
    },
    contextTarget() {
      const lease = capture();
      if (!lease.cell || lease.reason) return null;
      return {
        kind: 'generated-table-cell' as const,
        key: JSON.stringify([lease.state.token, lease.state.stateVersion, lease.cell]),
        current: () => isCurrent(lease),
      };
    },
    async apply(lease: GeneratedTableGridCapture, command: GeneratedTableGridCommand) {
      let admitted = false,
        dispatched = false;
      try {
        if (pending) throw Error('GeneratedTableGridPending');
        const reason = actionReason(lease, command);
        if (reason) throw Error(reason);
        const c = lease.cell!;
        const action = command.slice(
          'generated-table-'.length,
        ) as GeneratedTableGridPayload['action'];
        // Insert after the selected row/column, delete the selected row/column.
        const index = action.endsWith('row') ? c.row : c.column;
        const payload = Object.freeze({
          section: c.section,
          identity: c.identity,
          action,
          index: index + (action.startsWith('insert') ? 1 : 0),
        });
        pending = true;
        admitted = true;
        await editor.update(() => {});
        if (!isCurrent(lease)) throw Error('StaleGeneratedTableCell');
        const now = capture(true);
        if (now.reason || JSON.stringify(now.cell) !== JSON.stringify(c))
          throw Error(now.reason ?? 'StaleGeneratedTableCell');
        const definition = core.EDIT_CREATED_TABLE_GRID_COMMAND;
        if (!definition || !isCurrent(lease)) throw Error('StaleGeneratedTableCell');
        consumed.add(lease);
        dispatched = true;
        return await editor.dispatchCommand(definition, payload);
      } catch (error) {
        if (dispatched) throw error;
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
export type GeneratedTableGridPort = ReturnType<typeof createGeneratedTableGridPort>;
