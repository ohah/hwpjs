import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createHwp5CellSplitFixture } from '../helpers/hwp5-cell-split-fixture.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import {
  createEditor,
  SPLIT_SOURCE_TABLE_CELLS_COMMAND as SPLIT,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
assert(
  process.env.HWPJS_TEST_WASM && process.env.HWPJS_TEST_OLD_WASM && process.env.HWPJS_TEST_EVIDENCE,
  'ExplicitSplitInputsRequired',
);
const module = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));
const before = await createHwp5CellSplitFixture(module);
const old = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_OLD_WASM));
function request(editor, extra = {}) {
  const cells = editor.tableBindings(0);
  const first = cells[0];
  return {
    binding: editor.sourceTableCellSplitBinding(),
    section: 0,
    tableNode: first.tableNode,
    expectedRows: 2,
    expectedColumns: 2,
    top: 0,
    left: 0,
    bottom: 1,
    right: 1,
    selectedCells: 1,
    splitRows: 2,
    splitColumns: 3,
    mode: 'each',
    equalizeRows: true,
    ...extra,
  };
}
async function sdk(t, wasm = module) {
  const e = await createExperimentalHwp5Editor(wasm, before);
  t.after(() => e.close());
  e.enableHistoryV2({});
  return e;
}
function oracle(input, output, row = 0, column = 0, label = 'sdk') {
  const evidence = join(process.env.HWPJS_TEST_EVIDENCE, label + '-r' + row + 'c' + column);
  mkdirSync(evidence, { recursive: true });
  const a = join(evidence, 'source.hwp'),
    b = join(evidence, 'split.hwp'),
    bad = join(evidence, 'bad-metadata.hwp');
  writeFileSync(a, input);
  writeFileSync(b, output);
  const altered = new Uint8Array(output),
    view = new DataView(altered.buffer, altered.byteOffset, altered.byteLength);
  const sector = 2 ** view.getUint16(30, true),
    directory = view.getUint32(48, true);
  altered[(directory + 1) * sector + 80] ^= 1;
  writeFileSync(bad, altered);
  const script = new URL('./source-table-cell-split-oracle.py', import.meta.url).pathname;
  for (const flags of [[], ['-O']]) {
    const result = JSON.parse(
      execFileSync('python3', [...flags, script, a, b, String(row), String(column)], {
        encoding: 'utf8',
      }),
    );
    assert.equal(result.recordOracle, 'passed');
    for (const invalid of [a, bad])
      assert.throws(
        () =>
          execFileSync('python3', [...flags, script, a, invalid, String(row), String(column)], {
            stdio: ['pipe', 'pipe', 'pipe'],
          }),
        (e) => e.status === 1,
      );
    assert.throws(
      () =>
        execFileSync('python3', [...flags, script, a, b, String(1 - row), String(column)], {
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      (e) => e.status === 1,
    );
  }
}

test('actual SDK H5 caps and atomic save undo redo reopen exact', async (t) => {
  const e = await sdk(t);
  const cap = e.sourceTableCellSplitCapabilities();
  assert.equal(cap.format, 'hwp5');
  assert.equal(cap.maxSelectedCells, 1);
  assert.equal(cap.supportsMergedInput, false);
  const input = e.save({ allowStaleLayout: true }).bytes;
  const result = e.splitSourceTableCells(request(e));
  assert.equal(result.nativeCode, 1, result.error);
  const output = e.save({ allowStaleLayout: true }).bytes;
  assert.notDeepEqual(output, input);
  assert.equal(e.historyRevision(), 1);
  oracle(input, output);
  assert.equal(e.undo(), true);
  assert.deepEqual(e.save({ allowStaleLayout: true }).bytes, input);
  assert.equal(e.redo(), true);
  assert.deepEqual(e.save({ allowStaleLayout: true }).bytes, output);
  const reopened = await createExperimentalHwp5Editor(module, output);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.save({ allowStaleLayout: true }).bytes, output);
});
test('actual pre-H5-split ABI remains unavailable and all unsupported intents reject unchanged', async (t) => {
  const legacy = await sdk(t, old);
  assert.equal(legacy.supportsSourceTableCellSplit(), false);
  const e = await sdk(t);
  const input = e.save({ allowStaleLayout: true }).bytes;
  for (const extra of [
    { selectedCells: 2, right: 2 },
    { mode: 'merge-then-split' },
    { equalizeRows: false },
    { splitRows: 1, splitColumns: 1 },
  ]) {
    const result = e.splitSourceTableCells(request(e, extra));
    assert.equal(result.nativeCode, 0);
    assert.deepEqual(e.save({ allowStaleLayout: true }).bytes, input);
    assert.equal(e.historyRevision(), 0);
  }
});
test('SDK stale foreign and undo ABA binding refuses without another change', async (t) => {
  const a = await sdk(t),
    b = await sdk(t);
  const old = request(a);
  assert.equal(b.splitSourceTableCells(old).nativeCode, 0);
  assert.equal(a.splitSourceTableCells(old).nativeCode, 1);
  assert.equal(a.undo(), true);
  assert.equal(a.splitSourceTableCells(old).nativeCode, 0);
});
async function core(t, hooks = {}) {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  t.after(() => editor.dispose());
  await editor.load(before, { format: 'hwp5', editable: true });
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
const payload = (cap) => ({
  target: cap.target,
  rows: 2,
  columns: 3,
  mode: 'each',
  equalizeRows: true,
});
test('actual public Core capability and common split command H5 one undo redo', async (t) => {
  const { editor, lease } = await core(t);
  const cap = await editor.getSourceTableCellSplitCapabilities();
  assert(cap.available);
  assert.equal(cap.maxSelectedCells, 1);
  const input = (await editor.save({ allowStaleLayout: true })).bytes;
  const capture = lease.captureSourceTableCellSplit(witness(editor), () => true);
  assert(capture);
  assert.equal(capture.selection.profile, 'single-unmerged-source-cell');
  const result = await editor.dispatchCommand(SPLIT, payload(capture));
  assert.equal(result.status, 'committed-with-snapshot', result.error);
  assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
  const output = (await editor.save({ allowStaleLayout: true })).bytes;
  await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
  assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, input);
  await editor.dispatchCommand(REDO_COMMAND, { token: editor.getEditorState().token });
  assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, output);
  assert.equal(
    lease.captureSourceTableCellSplit(witness(editor), () => true),
    null,
  );
});
test('Core refuses multi-cell capture foreign target and delayed input stale witness', async (t) => {
  const gate = Promise.withResolvers(),
    entered = Promise.withResolvers();
  let live = true;
  const a = await core(t, {
      commitComposition() {
        entered.resolve();
        return gate.promise;
      },
    }),
    b = await core(t);
  assert.equal(
    a.lease.captureSourceTableCellSplit(witness(a.editor, [0, 1]), () => true),
    null,
  );
  const target = a.lease.captureSourceTableCellSplit(witness(a.editor), () => live);
  assert(target);
  assert.equal(
    (await b.editor.dispatchCommand(SPLIT, payload(target))).error,
    'ForeignSourceTableCellSplitTarget',
  );
  const work = a.editor.dispatchCommand(SPLIT, payload(target));
  await entered.promise;
  live = false;
  gate.resolve('unchanged');
  assert.equal((await work).error, 'StaleSourceTableCellSplitTarget');
  assert.equal(a.editor.getEditorState().nativeHistoryRevision, 0);
});

test('public typed boundary rejects experimental split bypass and old capability stays false', async (t) => {
  const { editor } = await core(t);
  assert.throws(
    () =>
      editor.requestExperimental(
        { kind: 'source-table-cell-split', request: {} },
        { mutation: true },
      ),
    /UseTypedEditorOperation/,
  );
  assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
  const legacy = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: old }) });
  t.after(() => legacy.dispose());
  await legacy.load(before, { format: 'hwp5', editable: true });
  assert.equal((await legacy.getSourceTableCellSplitCapabilities()).available, false);
});

test('capability decoder rejects widened H5 profile and accessors without invoking them', async (t) => {
  const { decodeSourceTableCellSplitCapability } =
    await import('../../js/source-table-cell-split-capability.mjs');
  const e = await sdk(t),
    cap = e.sourceTableCellSplitCapabilities();
  assert.throws(
    () => decodeSourceTableCellSplitCapability({ ...cap, maxSelectedCells: 2 }),
    /InvalidSourceTableSplitCapabilities/,
  );
  assert.throws(
    () => decodeSourceTableCellSplitCapability({ ...cap, supportsMergedInput: true }),
    /InvalidSourceTableSplitCapabilities/,
  );
  let read = false;
  assert.throws(() =>
    decodeSourceTableCellSplitCapability({
      ...cap,
      get format() {
        read = true;
        return 'hwp5';
      },
    }),
  );
  assert.equal(read, false);
});
test('raw Native unsupported mode clears prior capability output and preserves revision', async () => {
  const { createMemory } = await import('../../js/wasm-memory.mjs');
  const instance = await WebAssembly.instantiate(module, {}),
    w = instance.exports,
    memory = createMemory(w);
  try {
    assert.equal(
      memory.withBytes(before, (ptr, size) => w.hwp5_edit_open(ptr, size)),
      1,
    );
    assert.equal(
      memory.withBytes(new TextEncoder().encode('{}'), (ptr, size) =>
        w.hwp5_edit_history_enable_options(ptr, size),
      ),
      1,
    );
    assert.equal(w.hwp5_edit_source_table_cell_split_capabilities(), 1);
    const cap = JSON.parse(
      new TextDecoder().decode(memory.copy(w.hwp5_edit_output_ptr(), w.hwp5_edit_output_len())),
    );
    assert(w.hwp5_edit_output_len() > 0);
    const words = (value) => {
      const n = BigInt(value);
      return [Number(n & 0xffffffffn), Number(n >> 32n)];
    };
    assert.equal(
      w.hwp5_edit_split_source_table_cells(
        0,
        0,
        2,
        2,
        0,
        0,
        1,
        1,
        1,
        2,
        3,
        1,
        1,
        cap.binding.revision,
        ...words(cap.binding.session.slice(1)),
        ...words(cap.binding.serial),
      ),
      0,
    );
    assert.equal(memory.error().message, 'UnsupportedSourceTableSplitMode');
    assert.equal(w.hwp5_edit_output_len(), 0);
    assert.equal(w.hwp5_edit_history_revision(), 0);
  } finally {
    w.hwp5_edit_output_free();
    w.hwp5_edit_close();
  }
});

test('public Core splits every original cell corner with independent record and history checks', async (t) => {
  for (let index = 0; index < 4; index++) {
    const { editor, lease } = await core(t);
    const input = (await editor.save({ allowStaleLayout: true })).bytes;
    const captured = lease.captureSourceTableCellSplit(witness(editor, [index]), () => true);
    const result = await editor.dispatchCommand(SPLIT, payload(captured));
    assert.equal(result.status, 'committed-with-snapshot');
    assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
    const output = (await editor.save({ allowStaleLayout: true })).bytes;
    oracle(input, output, Math.floor(index / 2), index % 2, 'core');
    await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
    assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, input);
    await editor.dispatchCommand(REDO_COMMAND, { token: editor.getEditorState().token });
    assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, output);
  }
});
