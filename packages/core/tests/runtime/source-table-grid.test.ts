import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { createEditor, EDIT_SOURCE_TABLE_GRID_COMMAND } from '../../src/index.ts';
import type { SourceTableGridAction } from '../../src/commands/source-table-grid.ts';
import { createReaderRuntimeFactory, createWorkerRuntimeFactory } from '../../src/runtime.ts';

// Explicit fresh artifact and fixture pins; never substitute an older ABI build.
const required = (name: string) => {
  const value = process.env[name];
  assert(value && isAbsolute(value) && !/hwpers|title-column-roundtrip/i.test(value), name);
  return value;
};
const readPinned = (name: string) => {
  const bytes = readFileSync(required(name));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    process.env[`${name}_SHA256`],
    `${name}: hash`,
  );
  return bytes;
};
const module = await WebAssembly.compile(readPinned('HWPJS_TEST_WASM'));
for (const format of ['hwp5', 'hwpx'])
  assert(
    WebAssembly.Module.exports(module).some(
      (e) => e.kind === 'function' && e.name === `${format}_edit_source_table_grid`,
    ),
    `FreshSourceGridExportRequired:${format}`,
  );

for (const format of ['hwp5', 'hwpx'] as const) {
  const bytes = readPinned(
    format === 'hwp5' ? 'HWPJS_TEST_SOURCE_GRID_HWP5' : 'HWPJS_TEST_SOURCE_GRID_HWPX',
  );
  for (const transport of ['reader', 'worker'] as const)
    test(`${format} fresh WASM ${transport}: source fixture, four actions, full projection, history and reopen`, async () => {
      const runtimeFactory =
        transport === 'reader'
          ? createReaderRuntimeFactory({ wasmModule: module })
          : createWorkerRuntimeFactory({
              wasmModule: module,
              workerFactory: () =>
                new Worker(new URL('../../src/worker.ts', import.meta.url), { type: 'module' }),
            });
      const editor = createEditor({ runtimeFactory });
      const reopened = createEditor({ runtimeFactory });
      try {
        await editor.load(bytes, { format, editable: true });
        const content = () => editor.getEditorState().content as any;
        assert.equal(content().sourceTableGridAvailable, true);
        assert.equal((editor.getEditorState().capabilities as any).sourceTableGridAvailable, true);
        const selected = content().tables.find(
          (t: any) =>
            !t.partial &&
            t.rows > 0 &&
            t.columns > 0 &&
            t.cells.length === t.rows * t.columns &&
            t.cells.every((cell: any) => cell.rowSpan === 1 && cell.columnSpan === 1),
        );
        assert(selected, 'RectangularUnmergedSourceFixtureRequired');
        const section = selected.section;
        const ordinal = content()
          .tables.filter((t: any) => t.section === section)
          .indexOf(selected);
        // Re-resolve current source nodes after every structure edit; never reuse generated identity.
        const table = () => content().tables.filter((t: any) => t.section === section)[ordinal];
        const save = async () => (await editor.save({ allowStaleLayout: true })).bytes;
        for (const action of [
          'insert-row',
          'delete-row',
          'insert-column',
          'delete-column',
        ] as SourceTableGridAction[]) {
          const beforeTable = table();
          const rows = beforeTable.rows,
            columns = beforeTable.columns;
          const row = action === 'insert-row' || action === 'delete-row';
          const insert = action === 'insert-row' || action === 'insert-column';
          const index = (row ? rows : columns) - (insert ? 0 : 1);
          const before = await save();
          const revision = editor.getEditorState().operationRevision;
          const historyLength = editor.getEditorState().nativeHistoryRevisions?.length;
          assert(historyLength !== undefined);
          const result = await editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, {
            section,
            tableNode: beforeTable.tableNode,
            expectedRows: rows,
            expectedColumns: columns,
            layout: format === 'hwp5' ? 'observed8' : 'spec6',
            action,
            index,
          });
          assert.equal(result.status, 'committed-with-snapshot', result.error);
          // Failed admissions reserve Core revisions; one Native commit still adds exactly one entry.
          assert(editor.getEditorState().operationRevision > revision);
          assert.equal(editor.getEditorState().nativeHistoryRevisions?.length, historyLength + 1);
          assert.equal(content().window, undefined);
          assert.equal(content().viewKind, undefined);
          assert.equal(table().rows, rows + (row ? (insert ? 1 : -1) : 0));
          assert.equal(table().columns, columns + (row ? 0 : insert ? 1 : -1));
          assert(
            table().cells.every((cell: any) =>
              cell.paragraphs.every((id: number) =>
                content().paragraphs.some((p: any) => p.section === section && p.paragraph === id),
              ),
            ),
          );
          const after = await save();
          assert.equal((await editor.undo()).status, 'committed-with-snapshot');
          assert.deepEqual(await save(), before);
          assert.equal((await editor.redo()).status, 'committed-with-snapshot');
          assert.deepEqual(await save(), after);
          await reopened.load(after, { format, editable: true });
          const reopenedTable = (reopened.getEditorState().content as any).tables.filter(
            (t: any) => t.section === section,
          )[ordinal];
          assert.equal(reopenedTable.rows, table().rows);
          assert.equal(reopenedTable.columns, table().columns);
          const stable = editor.getEditorState();
          const rejected = await editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, {
            section,
            tableNode: table().tableNode,
            expectedRows: table().rows + 1,
            expectedColumns: table().columns,
            action: 'insert-row',
            index: 0,
          });
          assert.equal(rejected.status, 'rejected-unapplied');
          assert.equal(editor.getEditorState().nativeHistoryRevision, stable.nativeHistoryRevision);
          assert.deepEqual(await save(), after);
        }
      } finally {
        await editor.dispose();
        await reopened.dispose();
      }
    });
}
