import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createEditor,
  SPLIT_SOURCE_TABLE_CELLS_COMMAND as SPLIT,
  MERGE_SOURCE_TABLE_CELLS_COMMAND as MERGE,
  UNDO_COMMAND,
  REDO_COMMAND,
  EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND as WIDTH,
} from '../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import { captureSourceTableCellSplitPayload } from '../../packages/core/src/commands/source-table-cell-split.ts';
import { createCellWidthFixture } from '../helpers/source-table-cell-width-fixture.mjs';
const wasm = process.env.HWPJS_TEST_WASM;
assert(wasm, 'Explicit HWPJS_TEST_WASM required');
const module = await WebAssembly.compile(readFileSync(wasm));
const original = await createCellWidthFixture(module);
const merger = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
let fullMerged;
try {
  await merger.load(original, { format: 'hwpx', editable: true });
  const lease = merger.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
  });
  const block = witness(merger, [0, 1, 2, 3]);
  const target = lease.captureSourceTableCellMerge(block, () => true);
  assert(target);
  const result = await merger.dispatchCommand(MERGE, target);
  assert.equal(result.status, 'committed-with-snapshot', result.error);
  fullMerged = (await merger.save()).bytes;
} finally {
  await merger.dispose();
}
async function create(t, file = 'valid.hwpx', hooks = {}) {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  t.after(() => editor.dispose());
  await editor.load(file === 'full-saved.hwpx' ? fullMerged : original, {
    format: 'hwpx',
    editable: true,
  });
  const lease = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
    ...hooks,
  });
  return { editor, lease };
}
function witness(editor, indices = [0]) {
  const { section, tableNode, rows, columns, cells } = editor.getEditorState().content.tables[0];
  return {
    section,
    tableNode,
    rows,
    columns,
    cells: indices
      .map((i) => cells[i])
      .map(({ listNode, row, column, paragraphs }) => ({ listNode, row, column, paragraphs })),
  };
}
const payload = (capture, extra = {}) => ({
  target: capture.target,
  rows: 1,
  columns: 2,
  mode: 'each',
  equalizeRows: true,
  ...extra,
});
test('actual split commits once, stale/foreign/cross-kind targets rejected, undo/redo exact', async (t) => {
  const a = await create(t),
    b = await create(t);
  let cap = a.lease.captureSourceTableCellSplit(witness(a.editor), () => true);
  assert(cap);
  assert.equal(cap.selection.selectedCells, 1);
  assert.equal(
    (await b.editor.dispatchCommand(SPLIT, payload(cap))).error,
    'ForeignSourceTableCellSplitTarget',
  );
  assert.equal(
    (await a.editor.dispatchCommand(MERGE, cap.target)).error,
    'ForeignSourceTableCellMergeTarget',
  );
  const before = (await a.editor.save()).bytes;
  cap = a.lease.captureSourceTableCellSplit(witness(a.editor), () => true);
  assert(cap);
  let result = await a.editor.dispatchCommand(SPLIT, payload(cap));
  assert.equal(result.status, 'committed-with-snapshot', result.error);
  assert.equal(a.editor.getEditorState().nativeHistoryRevision, 1);
  const after = (await a.editor.save()).bytes;
  assert.notDeepEqual(after, before);
  assert.equal(
    (await a.editor.dispatchCommand(SPLIT, payload(cap))).error,
    'StaleSourceTableCellSplitTarget',
  );
  await a.editor.dispatchCommand(UNDO_COMMAND, { token: a.editor.getEditorState().token });
  assert.deepEqual((await a.editor.save()).bytes, before);
  await a.editor.dispatchCommand(REDO_COMMAND, { token: a.editor.getEditorState().token });
  assert.deepEqual((await a.editor.save()).bytes, after);
});
test('merged cell span is admitted, each and merge-then-divide use physical count', async (t) => {
  const a = await create(t, 'full-saved.hwpx');
  const cap = a.lease.captureSourceTableCellSplit(witness(a.editor), () => true);
  assert(cap);
  assert.equal(cap.selection.selectedCells, 1);
  assert.equal(cap.selection.columns, 2);
  assert.equal(
    (await a.editor.dispatchCommand(SPLIT, payload(cap, { mode: 'merge-then-split' }))).error,
    'InvalidSourceTableSplitMode',
  );
  const result = await a.editor.dispatchCommand(SPLIT, payload(cap));
  assert.equal(result.status, 'committed-with-snapshot', result.error);
});
test('whole rectangular multi-cell selection permits both official modes', async (t) => {
  for (const mode of ['each', 'merge-then-split']) {
    const a = await create(t);
    const cap = a.lease.captureSourceTableCellSplit(witness(a.editor, [0, 1]), () => true);
    assert(cap);
    const result = await a.editor.dispatchCommand(SPLIT, payload(cap, { mode }));
    assert.equal(result.status, 'committed-with-snapshot', result.error);
  }
});
test('settlement gap, lease release, monotonic invalidation reject before mutation', async (t) => {
  const gate = Promise.withResolvers(),
    entered = Promise.withResolvers();
  let live = true;
  const a = await create(t, 'valid.hwpx', {
    commitComposition() {
      entered.resolve();
      return gate.promise;
    },
  });
  const cap = a.lease.captureSourceTableCellSplit(witness(a.editor), () => live);
  assert(cap);
  const result = a.editor.dispatchCommand(SPLIT, payload(cap));
  await entered.promise;
  live = false;
  gate.resolve('unchanged');
  assert.equal((await result).error, 'StaleSourceTableCellSplitTarget');
  live = true;
  assert.equal(
    (await a.editor.dispatchCommand(SPLIT, payload(cap))).error,
    'StaleSourceTableCellSplitTarget',
  );
  const fresh = a.lease.captureSourceTableCellSplit(witness(a.editor), () => true);
  a.lease.release();
  assert.equal(
    (await a.editor.dispatchCommand(SPLIT, payload(fresh))).error,
    'StaleSourceTableCellSplitTarget',
  );
  assert.equal(a.editor.getEditorState().nativeHistoryRevision, 0);
});
test('incomplete owner paragraphs, duplicate/diagonal cells and forged geometry refused', async (t) => {
  const a = await create(t);
  const value = witness(a.editor, [0, 1]);
  for (const cells of [
    [value.cells[0], value.cells[0]],
    [value.cells[0], { ...value.cells[1], column: 0 }],
    [{ ...value.cells[0], paragraphs: [] }],
    witness(a.editor, [0, 3]).cells,
  ])
    assert.equal(
      a.lease.captureSourceTableCellSplit({ ...value, cells }, () => true),
      null,
    );
});
test('payload boundary rejects accessors/extras/invalid numbers and preserves opaque identity', () => {
  const target = {};
  const valid = payload({ target });
  assert.equal(captureSourceTableCellSplitPayload(valid).target, target);
  for (const value of [
    { ...valid, rows: 0 },
    { ...valid, columns: 64 },
    { ...valid, columns: 1 },
    { ...valid, equalizeRows: 0 },
    { ...valid, mode: 'other' },
    { ...valid, unknown: 1 },
  ])
    assert.throws(() => captureSourceTableCellSplitPayload(value));
  let called = false;
  assert.throws(() =>
    captureSourceTableCellSplitPayload({
      ...valid,
      get rows() {
        called = true;
        return 2;
      },
    }),
  );
  assert.equal(called, false);
});
test('optional ABI preserves split merge named rename and heading symbols', () => {
  const names = new Set(WebAssembly.Module.exports(module).map((x) => x.name));
  for (const name of [
    'hwpx_edit_split_source_table_cells',
    'hwpx_edit_merge_source_table_cells',
    'hwpx_edit_rename_named_field',
    'hwp5_edit_paragraph_shapes_with_heading',
  ])
    assert(names.has(name), name);
});

test('capability-query boundary invalidation never reaches Native split', async (t) => {
  const { editor, lease } = await create(t);
  let checks = 0;
  const cap = lease.captureSourceTableCellSplit(witness(editor), () => ++checks < 7);
  assert(cap);
  const result = await editor.dispatchCommand(SPLIT, payload(cap));
  assert.equal(checks, 7);
  assert.equal(result.status, 'rejected-unapplied');
  assert.equal(result.error, 'StaleSourceTableCellSplitTarget');
  assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
  assert.deepEqual((await editor.save()).bytes, original);
});

test('split and width equalization retain independent history and opaque targets', async (t) => {
  const { editor, lease } = await create(t);
  const before = (await editor.save()).bytes;
  const width = lease.captureSourceTableCellWidth(witness(editor, [0, 1, 2, 3]), () => true);
  assert(width);
  assert.equal(
    (await editor.dispatchCommand(SPLIT, payload({ target: width }))).error,
    'ForeignSourceTableCellSplitTarget',
  );
  const split = lease.captureSourceTableCellSplit(witness(editor, [0, 1, 2, 3]), () => true);
  assert(split);
  const divided = await editor.dispatchCommand(SPLIT, payload(split));
  assert.equal(divided.status, 'committed-with-snapshot', divided.error);
  const splitBytes = (await editor.save()).bytes;
  const table = editor.getEditorState().content.tables[0];
  assert.equal(table.columns, 4);
  const target = lease.captureSourceTableCellWidth(
    witness(
      editor,
      table.cells.map((_, i) => i),
    ),
    () => true,
  );
  assert(target);
  const equalized = await editor.dispatchCommand(WIDTH, target);
  assert.equal(equalized.status, 'committed-with-snapshot', equalized.error);
  const final = (await editor.save()).bytes;
  assert.notDeepEqual(final, splitBytes);
  for (const expected of [splitBytes, before]) {
    const result = await editor.dispatchCommand(UNDO_COMMAND, {
      token: editor.getEditorState().token,
    });
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    assert.deepEqual((await editor.save()).bytes, expected);
  }
  for (const expected of [splitBytes, final]) {
    const result = await editor.dispatchCommand(REDO_COMMAND, {
      token: editor.getEditorState().token,
    });
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    assert.deepEqual((await editor.save()).bytes, expected);
  }
});
