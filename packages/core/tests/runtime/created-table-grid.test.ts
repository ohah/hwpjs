import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createEditor,
  createParagraphSelection,
  INSERT_TABLE_COMMAND,
  EDIT_CREATED_TABLE_GRID_COMMAND,
  getHistoryAvailability,
} from '../../src/index.ts';
import { createReaderRuntimeFactory, createWorkerRuntimeFactory } from '../../src/runtime.ts';
import { createReaderRuntime } from '../../../../web/preview/reader-runtime.mjs';
import { createNewDocumentBytes } from '../../../../js/new-document.mjs';

const path = process.env.HWPJS_TEST_WASM;
assert(path, 'ExplicitWasmRequired');
const module = await WebAssembly.compile(readFileSync(path));
const oldPath = process.env.HWPJS_TEST_OLD_WASM;
assert(oldPath, 'ExplicitOldWasmRequired');
const oldModule = await WebAssembly.compile(readFileSync(oldPath));
const actions = ['insert-row', 'delete-row', 'insert-column', 'delete-column'] as const;

for (const format of ['hwp5', 'hwpx'] as const) {
  for (const transport of ['reader', 'worker'] as const)
    test(`${format} real WASM ${transport} grid publishes all actions, undo/redo and rejection rollback`, async () => {
      const runtimeFactory =
        transport === 'reader'
          ? createReaderRuntimeFactory({ wasmModule: module })
          : createWorkerRuntimeFactory({
              wasmModule: module,
              workerFactory: () =>
                new Worker(new URL('../../src/worker.ts', import.meta.url), { type: 'module' }),
            });
      const editor = createEditor({ runtimeFactory });
      try {
        await editor.load(await createNewDocumentBytes(module, format), { format, editable: true });
        let state = editor.getEditorState();
        assert.equal((state.capabilities as any).createdTableGridAvailable, true);
        const content = state.content as any;
        assert.equal(content.createdTableGridAvailable, true);
        const host = content.paragraphs.find((p: any) => p.editable && !p.tableCell);
        assert(host);
        const resources = Object.fromEntries(
          Object.entries(content.tableCreationResources).map(([k, v]) => [k, (v as number[])[0]]),
        );
        const result = await editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          target: createParagraphSelection(state, {
            section: host.section,
            paragraph: host.paragraph,
            startUnit: 0,
          }),
          options: {
            rows: 2,
            columns: 2,
            width: 12000,
            rowHeight: 2000,
            resources: resources as any,
          },
        });
        assert.equal(result.status, 'committed-with-snapshot', result.error);
        const table = () => (editor.getEditorState().content as any).createdTables[0];
        const identity = table().identity;
        const snapshot = () => {
          const value = structuredClone(table());
          // Current-reference epochs intentionally advance across undo/redo.
          for (const cell of value.cells)
            if (cell.currentReference) delete cell.currentReference.epoch;
          return value;
        };
        const lease = editor.acquireInputSurface({
          commitComposition: () => 'unchanged',
          cancelComposition() {},
        });
        try {
          for (const [i, text] of ['A🙂', 'B', 'C한글', 'D'].entries()) {
            const cell = table().cells[i];
            const changed = await lease.request(
              {
                kind: 'created-cell-text',
                section: 0,
                identity,
                row: cell.row,
                column: cell.column,
                text,
                ...(cell.currentReference ? { reference: cell.currentReference } : {}),
              },
              { token: editor.getEditorState().token, coordinates: 'legacy-native' },
            );
            assert.equal(
              (changed as any).status,
              'committed-with-snapshot',
              (changed as any).error,
            );
          }
        } finally {
          lease.release();
        }
        let matrix = [
          ['A🙂', 'B'],
          ['C한글', 'D'],
        ];
        const verify = () => {
          const value = table();
          assert.equal(value.identity, identity);
          assert.equal(value.rows, matrix.length);
          assert.equal(value.columns, matrix[0].length);
          assert.deepEqual(
            value.cells.map((c: any) => [c.row, c.column, c.text]),
            matrix.flatMap((row, r) => row.map((text, c) => [r, c, text])),
          );
        };
        const save = async () => (await editor.save({ allowStaleLayout: true })).bytes;
        for (const action of actions) {
          const before = snapshot();
          const bytes = await save();
          state = editor.getEditorState();
          const changed = await editor.dispatchCommand(EDIT_CREATED_TABLE_GRID_COMMAND, {
            section: 0,
            identity,
            action,
            index: 1,
          });
          assert.equal(changed.status, 'committed-with-snapshot', changed.error);
          assert.notEqual(
            editor.getEditorState().nativeHistoryRevision,
            state.nativeHistoryRevision,
          );
          assert.notEqual(
            editor.getEditorState().operationRevision,
            editor.getEditorState().savedOperationRevision,
          );
          if (action === 'insert-row') matrix.splice(1, 0, Array(matrix[0].length).fill(''));
          if (action === 'delete-row') matrix.splice(1, 1);
          if (action === 'insert-column') matrix.forEach((r) => r.splice(1, 0, ''));
          if (action === 'delete-column') matrix.forEach((r) => r.splice(1, 1));
          verify();
          const after = snapshot(),
            afterBytes = await save();
          assert.equal((await editor.undo()).status, 'committed-with-snapshot');
          assert.deepEqual(snapshot(), before);
          assert.deepEqual(await save(), bytes);
          const revision = editor.getEditorState().nativeHistoryRevision;
          const rejected = await editor.dispatchCommand(EDIT_CREATED_TABLE_GRID_COMMAND, {
            section: 0,
            identity,
            action,
            index: 999999,
          });
          assert.equal(rejected.status, 'rejected-unapplied');
          assert.equal(editor.getEditorState().nativeHistoryRevision, revision);
          assert.deepEqual(snapshot(), before);
          assert.equal(getHistoryAvailability(editor.getEditorState()).canRedo, true);
          assert.equal((await editor.redo()).status, 'committed-with-snapshot');
          assert.deepEqual(snapshot(), after);
          assert.deepEqual(await save(), afterBytes);
          verify();
        }
      } finally {
        await editor.dispose();
      }
    });
  test(`${format} real old ABI keeps open/enable and rejects grid without history mutation`, async () => {
    const runtime = createReaderRuntime({ wasmModule: oldModule });
    try {
      const bytes = await createNewDocumentBytes(oldModule, format);
      const load = await runtime.request({ kind: 'load', format, bytes });
      assert.equal(load.error, undefined);
      assert.equal(load.createdTableGridAvailable, false);
      assert.equal(load.content.createdTableGridAvailable, false);
      const enable = await runtime.request({ kind: 'enable' });
      assert.equal(enable.error, undefined);
      assert.equal(enable.createdTableGridAvailable, false);
      const result = await runtime.request({
        kind: 'created-table-grid',
        section: 0,
        identity: '1',
        action: 'insert-row',
        index: 0,
      });
      assert.equal(result.error, 'CreatedTableGridUnavailable');
      assert.equal(result.applied, false);
      assert.deepEqual(runtime.outcome(result), { application: 'unapplied', changed: false });
      assert.equal(result.historyRevision, enable.historyRevision);
    } finally {
      await runtime.dispose();
    }
  });
}
