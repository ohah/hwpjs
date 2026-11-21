import { EDIT_CREATED_CELL_PROPERTIES_COMMAND, type HeadlessEditor } from '@hwpjs/core';
// @ts-ignore Canonical shared request admission; no Native authority is minted here.
import {
  createdCellPropertiesMessage,
  captureCreatedCellPropertiesPatch,
} from '../../../js/created-cell-properties.mjs';
import type {
  GeneratedTableGridHost,
  GeneratedTableGridSelection,
} from './generated-table-grid-port.ts';
export interface CreatedCellPropertiesHost extends GeneratedTableGridHost {
  captureCreatedCellPropertiesSelection?():
    | (GeneratedTableGridSelection & { bindDialog(element: HTMLDialogElement): boolean })
    | null;
}
/** Uses the existing generated-cell lease; never issues an original-cell selection. */
export function createCreatedCellPropertiesPort(
  editor: HeadlessEditor,
  getHost: () => CreatedCellPropertiesHost | undefined,
) {
  let disposed = false,
    pending = false;
  const issued = new WeakMap<
    object,
    {
      current(): boolean;
      state: unknown;
      bindDialog?: (element: HTMLDialogElement) => boolean;
      token: readonly unknown[];
      version: number;
    }
  >();
  const tokenOf = (state: any) =>
    ['editorId', 'documentId', 'generation', 'operationRevision', 'viewRevision'].map(
      (key) => state.token[key],
    );
  function capture() {
    const state = editor.getEditorState();
    const host = getHost();
    const selected = host?.captureCreatedCellPropertiesSelection
      ? host.captureCreatedCellPropertiesSelection()
      : host?.captureGeneratedTableGridSelection?.();
    if (disposed || !selected || selected.state !== state || selected.current() !== true)
      throw Error('StaleCreatedCellProperties');
    const content = state.content as any;
    const address = selected.createdCell;
    const tables = content?.createdTables?.filter(
      (table: any) => table.section === selected.section && table.identity === address.identity,
    );
    if (!Array.isArray(tables) || tables.length !== 1 || tables[0].partial)
      throw Error('InvalidCreatedCellPropertiesTarget');
    const cells = tables[0].cells?.filter(
      (cell: any) => cell.row === address.row && cell.column === address.column,
    );
    if (
      !Array.isArray(cells) ||
      cells.length !== 1 ||
      ![cells[0].width, cells[0].height].every(
        (n) => Number.isInteger(n) && n > 0 && n <= 0xffffffff,
      )
    )
      throw Error('InvalidCreatedCellPropertiesTarget');
    const value = Object.freeze({
      state,
      section: selected.section,
      identity: address.identity,
      row: address.row,
      column: address.column,
      expected: Object.freeze({ width: cells[0].width, height: cells[0].height }),
    });
    if (editor.getEditorState() !== state || selected.current() !== true)
      throw Error('StaleCreatedCellProperties');
    issued.set(value, {
      state,
      bindDialog:
        'bindDialog' in selected && typeof selected.bindDialog === 'function'
          ? selected.bindDialog.bind(selected)
          : undefined,
      current: selected.current.bind(selected),
      token: tokenOf(state),
      version: state.stateVersion,
    });
    return value;
  }
  const current = (value: ReturnType<typeof capture>) => {
    const lease = issued.get(value),
      now = editor.getEditorState();
    if (
      disposed ||
      !lease ||
      lease.state !== now ||
      lease.version !== now.stateVersion ||
      !lease.current() ||
      !lease.token.every((n, i) => n === tokenOf(now)[i])
    )
      throw Error('StaleCreatedCellProperties');
  };
  return {
    capture,
    isCurrent(value: ReturnType<typeof capture>) {
      try {
        current(value);
        return true;
      } catch {
        return false;
      }
    },
    bindDialog(value: ReturnType<typeof capture>, element: HTMLDialogElement) {
      const lease = issued.get(value);
      return !!lease?.bindDialog && lease.bindDialog(element) === true;
    },
    async apply(
      value: ReturnType<typeof capture>,
      patch: { size?: { width?: number; height?: number }; appearance?: unknown },
    ) {
      if (pending) throw Error('CreatedCellPropertiesPending');
      const safePatch = captureCreatedCellPropertiesPatch(patch);
      current(value);
      const message = createdCellPropertiesMessage(
        {
          section: value.section,
          identity: value.identity,
          row: value.row,
          column: value.column,
          expected: value.expected,
          ...safePatch,
        },
        value.state,
      );
      current(value);
      pending = true;
      // Consume before dispatch: uncertain results never replay the old lease.
      issued.delete(value);
      try {
        const { kind: _kind, ...payload } = message;
        return await editor.dispatchCommand(EDIT_CREATED_CELL_PROPERTIES_COMMAND, payload);
      } finally {
        pending = false;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
