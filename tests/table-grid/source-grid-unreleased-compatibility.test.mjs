import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createEditor,
  EDIT_SOURCE_TABLE_GRID_COMMAND as GRID,
} from '../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
for (const key of [
  'HWPJS_TEST_SOURCE_GRID_FIXTURE_DIR',
  'HWPJS_TEST_SOURCE_GRID_BASELINE_WASM',
  'HWPJS_TEST_SOURCE_GRID_R1_WASM',
  'HWPJS_TEST_SOURCE_GRID_R2_WASM',
  'HWPJS_TEST_SOURCE_GRID_INTERMEDIATE_WASM',
])
  assert(process.env[key], 'ExplicitUnreleasedComparisonInput:' + key);
const root = pathToFileURL(process.env.HWPJS_TEST_SOURCE_GRID_FIXTURE_DIR + '/');
const save = async (editor) => (await editor.save({ allowStaleLayout: true })).bytes;
// Exact historical real Native cohorts, separate from current-format regressions.
for (const format of ['hwp5', 'hwpx'])
  for (const mode of ['vertical', 'nested'])
    test(`${format} ${mode}: actual previous WASM refuses expansion without bytes/history change`, async (t) => {
      const old = await WebAssembly.compile(
        readFileSync(process.env.HWPJS_TEST_SOURCE_GRID_BASELINE_WASM),
      );
      const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: old }) });
      t.after(() => e.dispose());
      const source = new Uint8Array(
        readFileSync(new URL(mode + '.' + (format === 'hwp5' ? 'hwp' : 'hwpx'), root)),
      );
      await e.load(source, { format, editable: true });
      const table = e.getEditorState().content.tables.at(-1);
      const r = await e.dispatchCommand(GRID, {
        section: 0,
        tableNode: table.tableNode,
        expectedRows: 3,
        expectedColumns: 3,
        action: 'insert-row',
        index: 1,
        ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
      });
      assert.equal(r.status, 'rejected-unapplied');
      assert.match(r.error, /Unsupported|Merged/);
      assert.equal(e.getEditorState().nativeHistoryRevision, 0);
      assert.deepEqual(await save(e), source);
    });

for (const format of ['hwp5', 'hwpx'])
  for (const mode of ['interval-columns', 'interval-rows'])
    test(`${format} ${mode}: actual previous WASM refuses expansion without bytes/history change`, async (t) => {
      const old = await WebAssembly.compile(
        readFileSync(process.env.HWPJS_TEST_SOURCE_GRID_R1_WASM),
      );
      const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: old }) });
      t.after(() => e.dispose());
      const source = new Uint8Array(
        readFileSync(new URL(mode + '.' + (format === 'hwp5' ? 'hwp' : 'hwpx'), root)),
      );
      await e.load(source, { format, editable: true });
      const table = e.getEditorState().content.tables.at(-1);
      const r = await e.dispatchCommand(GRID, {
        section: 0,
        tableNode: table.tableNode,
        expectedRows: 3,
        expectedColumns: 3,
        action: 'insert-row',
        index: 1,
        ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
      });
      assert.equal(r.status, 'rejected-unapplied');
      assert.match(r.error, /AmbiguousSourceTableTracks/);
      assert.equal(e.getEditorState().nativeHistoryRevision, 0);
      assert.deepEqual(await save(e), source);
    });

for (const format of ['hwp5', 'hwpx'])
  for (const mode of ['caption-top-before', 'caption-bottom-before'])
    test(`${format} ${mode}: frozen R2 refuses exact input without history`, async (t) => {
      const old = await WebAssembly.compile(
        readFileSync(process.env.HWPJS_TEST_SOURCE_GRID_R2_WASM),
      );
      const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: old }) });
      t.after(() => e.dispose());
      const source = new Uint8Array(
        readFileSync(new URL(mode + '.' + (format === 'hwp5' ? 'hwp' : 'hwpx'), root)),
      );
      await e.load(source, { format, editable: true });
      const table = e.getEditorState().content.tables[0];
      const r = await e.dispatchCommand(GRID, {
        section: 0,
        tableNode: table.tableNode,
        expectedRows: 3,
        expectedColumns: 3,
        action: 'insert-row',
        index: 1,
        ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
      });
      assert.equal(r.status, 'rejected-unapplied');
      assert.match(r.error, /UnsupportedSourceTableGrid|UnsupportedSourceTableStructure/);
      assert.equal(e.getEditorState().nativeHistoryRevision, 0);
      assert.deepEqual(await save(e), source);
    });

test('hwp5 intermediate admission accepted a mismatched presence declaration; final Native refuses it', async () => {
  const { createExperimentalHwp5Editor } = await import('../../js/hwp5-editor.mjs');
  const old = await WebAssembly.compile(
    readFileSync(process.env.HWPJS_TEST_SOURCE_GRID_INTERMEDIATE_WASM),
  );
  const source = new Uint8Array(readFileSync(new URL('caption-reject-presence.hwp', root)));
  const n = await createExperimentalHwp5Editor(old, source);
  try {
    n.enableHistoryV2();
    const node = n.tableBindings(0)[0].tableNode;
    n.editSourceTableGrid({
      section: 0,
      tableNode: node,
      expectedRows: 3,
      expectedColumns: 3,
      action: 'insert-row',
      index: 1,
      layout: 'observed8',
    });
    assert.equal(n.historyRevision(), 1);
  } finally {
    n.close();
  }
});
