import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  createEditor,
  EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND as WIDTH,
  MERGE_SOURCE_TABLE_CELLS_COMMAND as MERGE,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../packages/core/src/index.ts';
import {
  createReaderEditorRuntime,
  createReaderRuntimeFactory,
} from '../../packages/core/src/runtime.ts';
import { createHwp5CellWidthFixture } from '../helpers/hwp5-cell-width-fixture.mjs';
import { sourceTableCellWidthPlanForFormat } from '../../web/preview/source-table-cell-width-format.mjs';
const module = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));
const original = await createHwp5CellWidthFixture(module);
async function create(
  t,
  {
    source = original,
    hooks = {},
    runtimeFactory = createReaderRuntimeFactory({ wasmModule: module }),
  } = {},
) {
  const editor = createEditor({ runtimeFactory });
  t.after(() => editor.dispose());
  await editor.load(source, { format: 'hwp5', editable: true });
  const lease = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
    ...hooks,
  });
  return { editor, lease };
}
function witness(editor, top = 0, bottom = 2, left = 0, right = 2) {
  const { section, tableNode, rows, columns, cells } = editor.getEditorState().content.tables[0];
  return {
    section,
    tableNode,
    rows,
    columns,
    cells: cells
      .filter((c) => c.row >= top && c.row < bottom && c.column >= left && c.column < right)
      .map(({ listNode, row, column, paragraphs }) => ({ listNode, row, column, paragraphs })),
  };
}
const save = async (e) => (await e.save({ allowStaleLayout: true })).bytes;
const dispatch = async (e, command) =>
  e.dispatchCommand(command, { token: e.getEditorState().token });
function oracle(before, after, rectangle, widths) {
  for (const flags of [[], ['-O']]) {
    const request = {
      before: Buffer.from(before).toString('base64'),
      after: Buffer.from(after).toString('base64'),
      rectangle,
      widths,
      listHeaderBytes: 8,
    };
    const result = JSON.parse(
      execFileSync('python3', [...flags, 'tools/hwp5-cell-width-oracle.py'], {
        input: JSON.stringify(request),
      }),
    );
    assert.equal(result.cells, (rectangle[2] - rectangle[0]) * (rectangle[3] - rectangle[1]));
    assert.throws(
      () =>
        execFileSync('python3', [...flags, 'tools/hwp5-cell-width-oracle.py'], {
          input: JSON.stringify({
            ...request,
            widths: widths.map((v, i) => v + (i === 0 ? 1 : i === 1 ? -1 : 0)),
          }),
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      (e) => e.status === 1,
    );
  }
}
for (const [name, top, bottom] of [
  ['full', 0, 2],
  ['first', 0, 1],
  ['last', 1, 2],
])
  test(`${name} HWP5 source block uses one owned batch and exact CFB/history/reopen`, async (t) => {
    const { editor, lease } = await create(t);
    const before = await save(editor);
    assert.deepEqual(before, original);
    assert.equal(editor.getEditorState().content.sourceTableCellWidthAvailable, true);
    const target = lease.captureSourceTableCellWidth(witness(editor, top, bottom), () => true);
    assert(target);
    const result = await editor.dispatchCommand(WIDTH, target);
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
    // HWP5's existing explicit stale-layout consent remains required.
    await assert.rejects(editor.save(), /LayoutReflowRequired/);
    const after = await save(editor);
    oracle(before, after, [top, 0, bottom, 2], [10000, 10000]);
    await dispatch(editor, UNDO_COMMAND);
    assert.deepEqual(await save(editor), before);
    await dispatch(editor, REDO_COMMAND);
    assert.deepEqual(await save(editor), after);
    await editor.load(after, { format: 'hwp5', editable: true });
    assert.deepEqual((await editor.save()).bytes, after);
  });
test('partial columns and one-HU remainder preserve all unselected record bytes', async (t) => {
  const source = await createHwp5CellWidthFixture(module, { widths: [6000, 14001, 5000] });
  const { editor, lease } = await create(t, { source });
  const before = await save(editor);
  const target = lease.captureSourceTableCellWidth(witness(editor), () => true);
  assert(target);
  assert.equal((await editor.dispatchCommand(WIDTH, target)).status, 'committed-with-snapshot');
  const after = await save(editor);
  oracle(before, after, [0, 0, 2, 2], [10001, 10000]);
  await dispatch(editor, UNDO_COMMAND);
  assert.deepEqual(await save(editor), before);
  await dispatch(editor, REDO_COMMAND);
  assert.deepEqual(await save(editor), after);
});
test('unknown source metadata, merges and signed heights never gain width authority', async (t) => {
  const { editor } = await create(t);
  const table = editor.getEditorState().content.tables[0];
  const request = {
    section: table.section,
    tableNode: table.tableNode,
    expectedRows: table.rows,
    expectedColumns: table.columns,
    top: 0,
    left: 0,
    bottom: 2,
    right: 2,
  };
  const variants = [
    () => {
      const x = structuredClone(table);
      delete x.layoutSource;
      return x;
    },
    () => {
      const x = structuredClone(table);
      delete x.sourceGeometry;
      return x;
    },
    () => {
      const x = structuredClone(table);
      delete x.cells[0].layoutSource;
      return x;
    },
    () => {
      const x = structuredClone(table);
      x.cells[0].layoutSource.extra_bytes = 2;
      return x;
    },
    () => {
      const x = structuredClone(table);
      x.cells[0].layoutSource.attributes = 0x80000000;
      return x;
    },
    () => {
      const x = structuredClone(table);
      x.cells[0].height = -1;
      return x;
    },
    () => {
      const x = structuredClone(table);
      x.cells[0].height = 0xffffffff;
      return x;
    },
    () => {
      const x = structuredClone(table);
      x.cells[0].rowSpan = 2;
      return x;
    },
  ];
  for (const variant of variants)
    assert.throws(
      () => sourceTableCellWidthPlanForFormat('hwp5', variant(), request),
      /Metadata|Geometry/,
    );
  assert.deepEqual(await save(editor), original);
  assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
  const signed = await createHwp5CellWidthFixture(module, { heights: [0xffffffff, 3000] });
  const b = await create(t, { source: signed });
  assert.equal(
    b.lease.captureSourceTableCellWidth(witness(b.editor), () => true),
    null,
  );
  assert.deepEqual(await save(b.editor), signed);
});
test('zero source height remains zero while redistributing widths', async (t) => {
  const source = await createHwp5CellWidthFixture(module, { heights: [0, 3000] });
  const { editor, lease } = await create(t, { source });
  const target = lease.captureSourceTableCellWidth(witness(editor), () => true);
  assert(target);
  assert.equal((await editor.dispatchCommand(WIDTH, target)).status, 'committed-with-snapshot');
  oracle(source, await save(editor), [0, 0, 2, 2], [10000, 10000]);
});
test('foreign, cloned, expired and released targets cannot mutate HWP5 or borrow merge authority', async (t) => {
  const a = await create(t),
    b = await create(t);
  let live = true;
  const target = a.lease.captureSourceTableCellWidth(witness(a.editor), () => live);
  assert(target);
  for (const [editor, command, value, error] of [
    [b.editor, WIDTH, target, 'ForeignSourceTableCellWidthTarget'],
    [a.editor, WIDTH, { ...target }, 'ForeignSourceTableCellWidthTarget'],
    [a.editor, MERGE, target, 'ForeignSourceTableCellMergeTarget'],
  ])
    assert.equal((await editor.dispatchCommand(command, value)).error, error);
  live = false;
  assert.equal(
    (await a.editor.dispatchCommand(WIDTH, target)).error,
    'StaleSourceTableCellWidthTarget',
  );
  live = true;
  assert.equal(
    (await a.editor.dispatchCommand(WIDTH, target)).error,
    'StaleSourceTableCellWidthTarget',
  );
  const fresh = a.lease.captureSourceTableCellWidth(witness(a.editor), () => true);
  a.lease.release();
  assert.equal(
    (await a.editor.dispatchCommand(WIDTH, fresh)).error,
    'StaleSourceTableCellWidthTarget',
  );
  assert.deepEqual(await save(a.editor), original);
});
test('IME settlement invalidates a selection before Native write', async (t) => {
  let live = true;
  const { editor, lease } = await create(t, {
    hooks: {
      commitComposition() {
        live = false;
        return 'unchanged';
      },
    },
  });
  const target = lease.captureSourceTableCellWidth(witness(editor), () => live);
  assert(target);
  assert.equal((await editor.dispatchCommand(WIDTH, target)).status, 'rejected-unapplied');
  assert.deepEqual(await save(editor), original);
  assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
});
test('queued double admission writes once, stale second command is rejected', async (t) => {
  const { editor, lease } = await create(t);
  const target = lease.captureSourceTableCellWidth(witness(editor), () => true);
  const r = await Promise.all([
    editor.dispatchCommand(WIDTH, target),
    editor.dispatchCommand(WIDTH, target),
  ]);
  assert.equal(r[0].status, 'committed-with-snapshot');
  assert.equal(r[1].status, 'rejected-unapplied');
  assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
  await dispatch(editor, UNDO_COMMAND);
  assert.deepEqual(await save(editor), original);
});
test('already-equal no-op retains an independent redo branch', async (t) => {
  const { editor, lease } = await create(t);
  let target = lease.captureSourceTableCellWidth(witness(editor, 0, 1), () => true);
  await editor.dispatchCommand(WIDTH, target);
  const first = await save(editor);
  target = lease.captureSourceTableCellWidth(witness(editor, 1, 2), () => true);
  await editor.dispatchCommand(WIDTH, target);
  const second = await save(editor);
  await dispatch(editor, UNDO_COMMAND);
  assert.deepEqual(await save(editor), first);
  target = lease.captureSourceTableCellWidth(witness(editor, 0, 1), () => true);
  assert.equal((await editor.dispatchCommand(WIDTH, target)).status, 'known-no-op');
  await dispatch(editor, REDO_COMMAND);
  assert.deepEqual(await save(editor), second);
});
test('real post-commit reply mismatch requires refresh and never retries HWP5 batch', async (t) => {
  const { bindRuntimeAdmission } =
    await import('../../packages/core/src/internal/runtime-admission.ts');
  let writes = 0;
  const actual = createReaderEditorRuntime({ wasmModule: module });
  const runtime = { request: (m, c) => actual.request(m, c), dispose: () => actual.dispose() };
  bindRuntimeAdmission(
    runtime,
    async (message, context, admission) => {
      admission();
      const reply = await actual.request(message, context);
      if (message.kind === 'source-table-cell-width') {
        writes++;
        return { ...reply, kind: 'wrong-reply' };
      }
      return reply;
    },
    () => true,
  );
  const runtimeFactory = () => runtime;
  const { editor, lease } = await create(t, { runtimeFactory });
  const target = lease.captureSourceTableCellWidth(witness(editor), () => true);
  assert.equal((await editor.dispatchCommand(WIDTH, target)).status, 'committed-refresh-required');
  assert.equal(writes, 1);
  assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
  await editor.refresh();
  assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
  assert.equal(writes, 1);
  oracle(original, await save(editor), [0, 0, 2, 2], [10000, 10000]);
});
test('actual malformed source attributes, metadata and overlapping row span retain CFB and history', async (t) => {
  for (const [field, value] of [
    ['attributes', 0x80000000],
    ['unknown', 7],
    ['table-flags', 0x80000001],
    ['row-span', 2],
  ]) {
    const source = new Uint8Array(
      Buffer.from(
        execFileSync('python3', ['tests/helpers/hwp5-cell-width-mutator.py'], {
          input: JSON.stringify({ before: Buffer.from(original).toString('base64'), field, value }),
        })
          .toString()
          .trim(),
        'base64',
      ),
    );
    const { editor, lease } = await create(t, { source });
    const table = editor.getEditorState().content.tables[0];
    if (table)
      assert.equal(
        lease.captureSourceTableCellWidth(witness(editor), () => true),
        null,
        field,
      );
    assert.deepEqual(await save(editor), source, field);
    assert.equal(editor.getEditorState().nativeHistoryRevision, 0, field);
  }
});
test('missing optional HWP5 batch ABI reports unsupported, never falls back to single-cell writes', async (t) => {
  const wasm = Buffer.from(readFileSync(process.env.HWPJS_TEST_WASM));
  let p = 8;
  const leb = () => {
    let n = 0,
      shift = 0,
      v;
    do {
      v = wasm[p++];
      n += (v & 127) * 2 ** shift;
      shift += 7;
    } while (v & 128);
    return n;
  };
  let found = false;
  while (p < wasm.length) {
    const kind = wasm[p++],
      size = leb(),
      end = p + size;
    if (kind === 7) {
      const count = leb();
      for (let i = 0; i < count; i++) {
        const n = leb(),
          at = p,
          name = wasm.subarray(p, p + n).toString();
        p += n;
        const type = wasm[p++];
        leb();
        if (name === 'hwp5_edit_set_cell_sizes') {
          assert.equal(type, 0);
          wasm.fill(95, at, at + n);
          found = true;
        }
      }
      break;
    }
    p = end;
  }
  assert(found);
  const oldModule = await WebAssembly.compile(wasm);
  const { editor, lease } = await create(t, {
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: oldModule }),
  });
  assert.equal(editor.getEditorState().content.sourceTableCellWidthAvailable, false);
  assert.equal(
    lease.captureSourceTableCellWidth(witness(editor), () => true),
    null,
  );
  assert.deepEqual(await save(editor), original);
});

test('read-only and closed HWP5 surfaces cannot issue or reuse width authority', async (t) => {
  const { editor, lease } = await create(t);
  const target = lease.captureSourceTableCellWidth(witness(editor), () => true);
  assert(target);
  lease.release();
  await editor.load(original, { format: 'hwp5', editable: false });
  const readonly = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
  });
  assert.equal(editor.getEditorState().content.sourceTableCellWidthAvailable, false);
  assert.equal(
    readonly.captureSourceTableCellWidth(witness(editor), () => true),
    null,
  );
  assert.equal((await editor.dispatchCommand(WIDTH, target)).status, 'rejected-unapplied');
  await assert.rejects(save(editor), /EditorNotOpen/);
  const capturedWitness = witness(editor);
  await editor.dispose();
  assert.equal(
    readonly.captureSourceTableCellWidth(capturedWitness, () => true),
    null,
  );
});
test('Native owned batch rejects a late invalid owner atomically and preserves source plus history', async () => {
  const { createExperimentalHwp5Editor } = await import('../../js/hwp5-editor.mjs');
  const native = await createExperimentalHwp5Editor(module, original);
  try {
    native.enableHistoryV2();
    const cells = native.tableBindings(0);
    assert.throws(
      () =>
        native.setCellSizes([
          { section: 0, listNode: cells[0].listNode, width: 10000, height: cells[0].height },
          { section: 0, listNode: 0xfffffffe, width: 10000, height: cells[1].height },
        ]),
      /InvalidCellDisplayOwner/,
    );
    assert.equal(native.historyRevision(), 0);
    assert.equal(native.historyStats().undoCount, 0);
    assert.deepEqual(native.save().bytes, original);
    assert.deepEqual(native.tableBindings(0), cells);
  } finally {
    native.close();
  }
});
