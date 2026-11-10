import type { HeadlessEditor, EditorState, SelectionTarget, InsertTableOptions } from '@hwpjs/core';
import { exactParagraphNumber } from './paragraph-shape-number.ts';

export type TableInsertCore = Pick<
  typeof import('@hwpjs/core'),
  'INSERT_TABLE_COMMAND' | 'getSelectionFormatting' | 'getTableInsertAvailability'
>;
export interface TableInsertDraft {
  rows: string;
  columns: string;
  widthPoints: string;
  rowHeightPoints: string;
}
export interface TableInsertCapture {
  readonly state: EditorState;
  readonly target: SelectionTarget | null;
  readonly resources: InsertTableOptions['resources'] | null;
  readonly reason: string | null;
}
const uint = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
/** Presentation only. The public command/Native remain the final validators. */
export function tableInsertDimensions(draft: TableInsertDraft) {
  const rows = exactParagraphNumber(draft.rows, 1),
    columns = exactParagraphNumber(draft.columns, 1);
  const width = exactParagraphNumber(draft.widthPoints, 100),
    rowHeight = exactParagraphNumber(draft.rowHeightPoints, 100);
  if (
    ![rows, columns, width, rowHeight].every(uint) ||
    rows === 0 ||
    columns === 0 ||
    width < columns ||
    rowHeight === 0 ||
    rows * columns > 100000 ||
    rows * rowHeight > 0xffffffff
  )
    throw Error('InvalidTableCreationDimensions');
  return { rows, columns, width, rowHeight };
}
/** Same SDK namespace as the editor: never mint a command or target locally. */
export function createTableInsertBridge(editor: HeadlessEditor, core: Partial<TableInsertCore>) {
  let pending = false,
    disposed = false;
  const captures = new WeakSet<TableInsertCapture>();
  function capture(): TableInsertCapture {
    const state = editor.getEditorState();
    let target: SelectionTarget | null = null,
      resources: InsertTableOptions['resources'] | null = null,
      reason: string | null = null;
    try {
      if (disposed) throw Error('TableInsertDisposed');
      if (pending) throw Error('TableInsertPending');
      if (state.status !== 'ready') throw Error('EditorNotReady');
      if (
        core.INSERT_TABLE_COMMAND?.name !== 'insert-table' ||
        typeof core.INSERT_TABLE_COMMAND.id !== 'symbol' ||
        typeof core.getSelectionFormatting !== 'function' ||
        typeof core.getTableInsertAvailability !== 'function'
      )
        throw Error('TableInsertApiUnavailable');
      target = core.getSelectionFormatting(state).target;
      const availability = core.getTableInsertAvailability(state, target);
      if (availability.allowed !== true || availability.reason !== null)
        throw Error(
          availability.reason === 'UnsupportedTableInsertReference'
            ? '현재 문단에는 표를 삽입할 수 없습니다. 다른 본문 문단을 선택하세요.'
            : (availability.reason ?? 'TableInsertUnavailable'),
        );
      resources = availability.resources;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    const value = Object.freeze({ state, target, resources, reason });
    captures.add(value);
    return value;
  }
  return {
    capture,
    presentation() {
      const why = capture().reason;
      return { enabled: why === null, reason: why ?? undefined };
    },
    subscribe: (listener: (state: EditorState) => void) => editor.registerStateListener(listener),
    async insert(lease: TableInsertCapture, draft: TableInsertDraft) {
      let admitted = false,
        dispatched = false;
      try {
        if (disposed) throw Error('TableInsertDisposed');
        if (pending) throw Error('TableInsertPending');
        if (!captures.has(lease) || lease.reason || !lease.target || !lease.resources)
          throw Error(lease.reason ?? 'InvalidTableInsertLease');
        if (editor.getEditorState() !== lease.state) throw Error('StaleTableInsertSelection');
        const options = { ...tableInsertDimensions(draft), resources: lease.resources };
        pending = true;
        admitted = true;
        // Flush prior admissions, including selection-only changes, before the final snapshot check.
        await editor.update(() => {});
        if (disposed) throw Error('TableInsertDisposed');
        if (editor.getEditorState() !== lease.state) throw Error('StaleTableInsertSelection');
        dispatched = true;
        const result = await editor.dispatchCommand(core.INSERT_TABLE_COMMAND!, {
          target: lease.target,
          options,
        });
        // No selection issuance, cache patch or retry after commit/uncertain projection.
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
    },
    dispose() {
      disposed = true;
    },
  };
}
export type TableInsertBridge = ReturnType<typeof createTableInsertBridge>;
