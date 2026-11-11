import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import {
  createEditor,
  SPLIT_SOURCE_TABLE_CELLS_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';

assert(
  process.env.HWPJS_TEST_WASM &&
    process.env.HWPJS_TEST_NARROW_SPLIT_WASM &&
    process.env.HWPJS_TEST_EVIDENCE,
  'ExplicitMergedSplitInputsRequired',
);
const current = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));
const oldBytes = readFileSync(process.env.HWPJS_TEST_NARROW_SPLIT_WASM);
assert.equal(
  createHash('sha256').update(oldBytes).digest('hex'),
  '8ab4d335f7fba4aa764ed3e1191c390f17ee80f053b9ada89748a490547d1980',
);
const narrow = await WebAssembly.compile(oldBytes);
const fixtureRoot = new URL('../fixtures/hwp5-merged-cell-split/', import.meta.url);
const pins = JSON.parse(readFileSync(new URL('sha256.json', fixtureRoot), 'utf8'));
function fixture(kind) {
  const bytes = readFileSync(new URL(kind + '.hwp', fixtureRoot));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pins[kind]);
  return new Uint8Array(bytes);
}
const cases = [
  ['full', 2, 2, 0],
  ['vertical', 3, 2, 0],
  ['horizontal', 2, 3, 0],
  ['unselected-span', 2, 2, 1],
  ['offset', 3, 2, 4],
];
function witness(editor, index = 0) {
  const table = editor.getEditorState().content.tables[0],
    cell = table.cells[index];
  return {
    section: table.section,
    tableNode: table.tableNode,
    rows: table.rows,
    columns: table.columns,
    cells: [
      { listNode: cell.listNode, row: cell.row, column: cell.column, paragraphs: cell.paragraphs },
    ],
  };
}
async function core(t, bytes, module = current, editable = true) {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  t.after(() => editor.dispose());
  await editor.load(bytes, { format: 'hwp5', editable });
  const lease = editable
    ? editor.acquireInputSurface({ commitComposition: () => 'unchanged', cancelComposition() {} })
    : null;
  return { editor, lease };
}
function independent(kind, before, after) {
  const directory = join(process.env.HWPJS_TEST_EVIDENCE, 'merged-' + kind);
  mkdirSync(directory, { recursive: true });
  const a = join(directory, 'before.hwp'),
    b = join(directory, 'after.hwp');
  writeFileSync(a, before);
  writeFileSync(b, after);
  const script = new URL('./source-table-merged-cell-oracle.py', import.meta.url).pathname;
  for (const flags of [[], ['-O']]) {
    execFileSync('python3', [...flags, script, kind, a, b], { stdio: 'pipe' });
    assert.throws(
      () => execFileSync('python3', [...flags, script, kind, a, a], { stdio: 'pipe' }),
      (error) => error.status === 1,
    );
    assert.throws(
      () =>
        execFileSync('python3', [...flags, script, kind === 'full' ? 'offset' : 'full', a, b], {
          stdio: 'pipe',
        }),
      (error) => error.status === 1,
    );
  }
}
for (const [kind, rows, columns, index] of cases)
  test(
    'merged original ' + kind + ': SDK/Core full-span, CFB, one history and reopen',
    async (t) => {
      const input = fixture(kind),
        sdk = await createExperimentalHwp5Editor(current, input);
      t.after(() => sdk.close());
      sdk.enableHistoryV2({});
      const cells = [
          ...new Map(sdk.tableBindings(0).map((cell) => [cell.listNode, cell])).values(),
        ],
        cell = cells[index];
      const request = {
        binding: sdk.sourceTableCellSplitBinding(),
        section: 0,
        tableNode: cell.tableNode,
        expectedRows: Math.max(...cells.map((c) => c.row + c.rowSpan)),
        expectedColumns: Math.max(...cells.map((c) => c.column + c.columnSpan)),
        top: cell.row,
        left: cell.column,
        bottom: cell.row + cell.rowSpan,
        right: cell.column + cell.columnSpan,
        selectedCells: 1,
        splitRows: rows,
        splitColumns: columns,
        mode: 'each',
        equalizeRows: true,
      };
      if (cell.rowSpan > 1 || cell.columnSpan > 1) {
        assert.equal(
          sdk.splitSourceTableCells({ ...request, bottom: cell.row + 1, right: cell.column + 1 })
            .nativeCode,
          0,
        );
        assert.equal(sdk.historyRevision(), 0);
        assert.deepEqual(sdk.save({ allowStaleLayout: true }).bytes, input);
      }
      assert.equal(sdk.splitSourceTableCells(request).nativeCode, 1);
      const output = sdk.save({ allowStaleLayout: true }).bytes;
      assert.equal(sdk.historyRevision(), 1);
      independent(kind, input, output);
      assert.equal(sdk.undo(), true);
      assert.deepEqual(sdk.save({ allowStaleLayout: true }).bytes, input);
      assert.equal(sdk.redo(), true);
      assert.deepEqual(sdk.save({ allowStaleLayout: true }).bytes, output);
      const reopened = await createExperimentalHwp5Editor(current, output);
      t.after(() => reopened.close());
      assert.deepEqual(reopened.save({ allowStaleLayout: true }).bytes, output);
      const { editor, lease } = await core(t, input);
      const captured = lease.captureSourceTableCellSplit(witness(editor, index), () => true);
      assert(captured);
      assert.equal(captured.selection.profile, 'single-source-cell-with-spans');
      const result = await editor.dispatchCommand(SPLIT_SOURCE_TABLE_CELLS_COMMAND, {
        target: captured.target,
        rows,
        columns,
        mode: 'each',
        equalizeRows: true,
      });
      assert.equal(result.status, 'committed-with-snapshot', result.error);
      assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
      assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, output);
      await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
      assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, input);
      await editor.dispatchCommand(REDO_COMMAND, { token: editor.getEditorState().token });
      assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, output);
    },
  );
test('previous narrow engine and readonly documents do not gain merged admission', async (t) => {
  const input = fixture('full'),
    { editor, lease } = await core(t, input, narrow);
  const cap = await editor.getSourceTableCellSplitCapabilities();
  assert.equal(cap.available, true);
  assert.equal(cap.supportsMergedInput, false);
  assert.equal(
    lease.captureSourceTableCellSplit(witness(editor), () => true),
    null,
  );
  assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, input);
  assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
  const readonly = await core(t, input, current, false);
  const before = readonly.editor.getEditorState();
  assert.equal((await readonly.editor.getSourceTableCellSplitCapabilities()).available, false);
  assert.equal(readonly.editor.getEditorState(), before);
  assert.deepEqual(input, fixture('full'));
});
test('merged witnesses reject partial ownership, foreign target and undo ABA', async (t) => {
  const input = fixture('full'),
    a = await core(t, input),
    b = await core(t, input),
    full = witness(a.editor);
  assert(full.cells[0].paragraphs.length > 1);
  assert.equal(
    a.lease.captureSourceTableCellSplit(
      { ...full, cells: [{ ...full.cells[0], paragraphs: full.cells[0].paragraphs.slice(1) }] },
      () => true,
    ),
    null,
  );
  const capture = a.lease.captureSourceTableCellSplit(full, () => true);
  assert(capture);
  const payload = { target: capture.target, rows: 2, columns: 2, mode: 'each', equalizeRows: true };
  assert.equal(
    (await b.editor.dispatchCommand(SPLIT_SOURCE_TABLE_CELLS_COMMAND, payload)).error,
    'ForeignSourceTableCellSplitTarget',
  );
  assert.equal(
    (await a.editor.dispatchCommand(SPLIT_SOURCE_TABLE_CELLS_COMMAND, payload)).status,
    'committed-with-snapshot',
  );
  const output = (await a.editor.save({ allowStaleLayout: true })).bytes;
  await a.editor.dispatchCommand(UNDO_COMMAND, { token: a.editor.getEditorState().token });
  assert.equal(
    (await a.editor.dispatchCommand(SPLIT_SOURCE_TABLE_CELLS_COMMAND, payload)).error,
    'StaleSourceTableCellSplitTarget',
  );
  assert.deepEqual((await a.editor.save({ allowStaleLayout: true })).bytes, input);
  assert.equal(
    (await a.editor.dispatchCommand(REDO_COMMAND, { token: a.editor.getEditorState().token }))
      .status,
    'committed-with-snapshot',
  );
  assert.deepEqual((await a.editor.save({ allowStaleLayout: true })).bytes, output);
});
