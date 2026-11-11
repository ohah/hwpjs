import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import {
  EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND as WIDTH,
  MERGE_SOURCE_TABLE_CELLS_COMMAND as MERGE,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../packages/core/src/commands/commands.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import { sourceTableCellWidthPlan } from '../../web/preview/source-table-cell-width.mjs';
import { createCellWidthFixture } from '../helpers/source-table-cell-width-fixture.mjs';
const wasm = process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm';
const module = await WebAssembly.compile(readFileSync(wasm));
const original = await createCellWidthFixture(module);
const create = async (t, hooks = {}) => {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  t.after(() => editor.dispose());
  await editor.load(original, { format: 'hwpx', editable: true });
  const lease = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
    ...hooks,
  });
  return { editor, lease };
};
const witness = (editor, rect = [0, 0, 2, 2]) => {
  const { section, tableNode, rows, columns, cells } = editor.getEditorState().content.tables[0];
  const [top, left, bottom, right] = rect;
  return {
    section,
    tableNode,
    rows,
    columns,
    cells: cells
      .filter((c) => c.row >= top && c.row < bottom && c.column >= left && c.column < right)
      .map(({ listNode, row, column, paragraphs }) => ({ listNode, row, column, paragraphs })),
  };
};
const save = async (editor) => (await editor.save()).bytes;
function oracle(before, after, rectangle, widths) {
  const value = {
    before: Buffer.from(before).toString('base64'),
    after: Buffer.from(after).toString('base64'),
    part: 'Contents/section0.xml',
    rectangle,
    widths,
  };
  for (const flags of [[], ['-O']]) {
    const result = JSON.parse(
      execFileSync(
        'python3',
        [...flags, new URL('../../tools/hwpx-cell-width-oracle.py', import.meta.url).pathname],
        { input: JSON.stringify(value), stdio: ['pipe', 'pipe', 'pipe'] },
      ),
    );
    assert.equal(result.cells, (rectangle[2] - rectangle[0]) * (rectangle[3] - rectangle[1]));
    assert.throws(
      () =>
        execFileSync(
          'python3',
          [...flags, new URL('../../tools/hwpx-cell-width-oracle.py', import.meta.url).pathname],
          {
            input: JSON.stringify({ ...value, widths: widths.map((x) => x + 1) }),
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        ),
      (e) => e.status === 1,
    );
  }
}
for (const [name, rect] of [
  ['full', [0, 0, 2, 2]],
  ['first-row', [0, 0, 1, 2]],
  ['last-row', [1, 0, 2, 2]],
]) {
  test(
    name + ' source rectangle has independent whole ZIP/XML and exact one-step history',
    async (t) => {
      const { editor, lease } = await create(t);
      assert.equal(editor.getEditorState().content.sourceTableCellWidthAvailable, true);
      const before = await save(editor);
      const ticket = lease.captureSourceTableCellWidth(witness(editor, rect), () => true);
      assert(ticket);
      const result = await editor.dispatchCommand(WIDTH, ticket);
      assert.equal(result.status, 'committed-with-snapshot', result.error);
      assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
      const after = await save(editor);
      oracle(before, after, rect, [10000, 10000]);

      assert.equal(
        (await editor.dispatchCommand(WIDTH, ticket)).error,
        'StaleSourceTableCellWidthTarget',
      );
      assert.equal(
        (await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token }))
          .status,
        'committed-with-snapshot',
      );
      assert.deepEqual(await save(editor), before);
      assert.equal(
        (await editor.dispatchCommand(REDO_COMMAND, { token: editor.getEditorState().token }))
          .status,
        'committed-with-snapshot',
      );
      assert.deepEqual(await save(editor), after);
      const noop = lease.captureSourceTableCellWidth(witness(editor, rect), () => true);
      assert(noop);
      assert.equal((await editor.dispatchCommand(WIDTH, noop)).status, 'known-no-op');
      assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
      await editor.load(after, { format: 'hwpx', editable: true });
      assert.deepEqual(await save(editor), after);
    },
  );
}
test('foreign, forged, stale, detached targets and undo redo ABA fail before editing', async (t) => {
  const a = await create(t),
    b = await create(t);
  let live = true;
  const target = a.lease.captureSourceTableCellWidth(witness(a.editor), () => live);
  assert(target);
  assert.equal(
    (await b.editor.dispatchCommand(WIDTH, target)).error,
    'ForeignSourceTableCellWidthTarget',
  );
  assert.equal(
    (await a.editor.dispatchCommand(WIDTH, {})).error,
    'ForeignSourceTableCellWidthTarget',
  );
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
test('composition settlement invalidates admitted selection without native write', async (t) => {
  const gate = Promise.withResolvers(),
    entered = Promise.withResolvers();
  const { editor, lease } = await create(t, {
    commitComposition() {
      entered.resolve();
      return gate.promise;
    },
  });
  let current = true;
  const target = lease.captureSourceTableCellWidth(witness(editor), () => current);
  const pending = editor.dispatchCommand(WIDTH, target);
  await entered.promise;
  current = false;
  gate.resolve('unchanged');
  assert.equal((await pending).error, 'StaleSourceTableCellWidthTarget');
  assert.deepEqual(await save(editor), original);
});
test('invalid source rectangles retain redo and merge target authority', async (t) => {
  const { editor, lease } = await create(t);
  const block = witness(editor);
  assert.equal(
    lease.captureSourceTableCellWidth(
      { ...block, cells: [block.cells[0], block.cells.at(-1)] },
      () => true,
    ),
    null,
  );
  assert.equal(
    lease.captureSourceTableCellWidth(
      { ...block, cells: [block.cells[0], block.cells[2]] },
      () => true,
    ),
    null,
  );
  const merge = lease.captureSourceTableCellMerge(block, () => true);
  assert(merge);
  assert.equal(
    (await editor.dispatchCommand(WIDTH, merge)).error,
    'ForeignSourceTableCellWidthTarget',
  );
  const result = await editor.dispatchCommand(MERGE, merge);
  assert.equal(result.status, 'committed-with-snapshot', result.error);
  const after = await save(editor);
  await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
  assert.equal(
    lease.captureSourceTableCellWidth(
      { ...block, cells: [block.cells[0], block.cells[0]] },
      () => true,
    ),
    null,
  );
  await editor.dispatchCommand(REDO_COMMAND, { token: editor.getEditorState().token });
  assert.deepEqual(await save(editor), after);
});
test('geometry preserves physical borders and HU remainder, rejects nonrectangular or merged shape', () => {
  const table = {
    section: 0,
    tableNode: 1,
    rows: 2,
    columns: 3,
    sourceGeometry: { in_margin: [0, 0, 0, 0] },
    cells: Array.from({ length: 6 }, (_, i) => ({
      listNode: i,
      row: Math.floor(i / 3),
      column: i % 3,
      rowSpan: 1,
      columnSpan: 1,
      sourceMargin: { has_margin: false },
      width: [3000, 5000, 10001][i % 3],
      height: 1800,
    })),
  };
  const req = {
    section: 0,
    tableNode: 1,
    expectedRows: 2,
    expectedColumns: 3,
    top: 0,
    left: 1,
    bottom: 2,
    right: 3,
  };
  const edits = sourceTableCellWidthPlan(table, req);
  assert.deepEqual(
    edits.map((x) => x.width),
    [7501, 7500, 7501, 7500],
  );
  assert(edits.every((x) => x.height === 1800));
  const before = structuredClone(table);
  assert.equal(table.cells[0].width, 3000);
  const mixed = structuredClone(table);
  mixed.cells[3].width++;
  assert.throws(() => sourceTableCellWidthPlan(mixed, req), /NonRectangular/);
  const merged = structuredClone(table);
  merged.cells[0].columnSpan = 2;
  assert.throws(() => sourceTableCellWidthPlan(merged, req), /Geometry/);
  const narrow = structuredClone(table);
  narrow.cells[1].sourceMargin = { has_margin: true, margin: [4000, 4000, 0, 0] };
  assert.throws(() => sourceTableCellWidthPlan(narrow, req), /Insets/);
  assert.deepEqual(table, before);
});

test('width and existing Native merge retain independent history and a no-op preserves redo', async (t) => {
  const { editor, lease } = await create(t);
  const block = witness(editor);
  const width = lease.captureSourceTableCellWidth(block, () => true);
  assert(width);
  assert.equal((await editor.dispatchCommand(WIDTH, width)).status, 'committed-with-snapshot');
  const sized = await save(editor);
  const merge = lease.captureSourceTableCellMerge(witness(editor), () => true);
  assert(merge);
  assert.equal((await editor.dispatchCommand(MERGE, merge)).status, 'committed-with-snapshot');
  const merged = await save(editor);
  await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
  assert.deepEqual(await save(editor), sized);
  const noop = lease.captureSourceTableCellWidth(witness(editor), () => true);
  assert(noop);
  assert.equal((await editor.dispatchCommand(WIDTH, noop)).status, 'known-no-op');
  await editor.dispatchCommand(REDO_COMMAND, { token: editor.getEditorState().token });
  assert.deepEqual(await save(editor), merged);
  await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
  await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
  assert.deepEqual(await save(editor), original);
});

test('a mismatched reply after a real Native commit requires refresh and never retries the edit', async (t) => {
  const { createReaderEditorRuntime } = await import('../../packages/core/src/runtime.ts');
  const { bindRuntimeAdmission } =
    await import('../../packages/core/src/internal/runtime-admission.ts');
  let writes = 0;
  const actual = createReaderEditorRuntime({ wasmModule: module });
  const runtime = {
    request: (message, context) => actual.request(message, context),
    dispose: () => actual.dispose(),
  };
  bindRuntimeAdmission(
    runtime,
    async (message, context, admission) => {
      admission();
      const reply = await actual.request(message, context);
      if (message.kind === 'source-table-cell-width') {
        writes++;
        return { ...reply, kind: 'wrong-reply-kind' };
      }
      return reply;
    },
    () => true,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  t.after(() => editor.dispose());
  await editor.load(original, { format: 'hwpx', editable: true });
  const lease = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
  });
  const target = lease.captureSourceTableCellWidth(witness(editor), () => true);
  assert(target);
  const result = await editor.dispatchCommand(WIDTH, target);
  assert.equal(result.status, 'committed-refresh-required');
  assert.equal(writes, 1);
  assert.equal(
    lease.captureSourceTableCellWidth(witness(editor), () => true),
    null,
  );
  assert.equal(
    (await editor.dispatchCommand(WIDTH, target)).error,
    'StaleSourceTableCellWidthTarget',
  );
  assert.equal(writes, 1);
  await editor.refresh();
  oracle(original, await save(editor), [0, 0, 2, 2], [10000, 10000]);
});

test('readonly source, one-column blocks, and copied opaque targets cannot advertise width editing', async (t) => {
  const { editor, lease } = await create(t);
  const block = witness(editor);
  const target = lease.captureSourceTableCellWidth(block, () => true);
  assert(target);
  assert.equal(
    (await editor.dispatchCommand(WIDTH, { ...target })).error,
    'ForeignSourceTableCellWidthTarget',
  );
  assert.equal(
    lease.captureSourceTableCellWidth(witness(editor, [0, 0, 2, 1]), () => true),
    null,
  );
  lease.release();
  await editor.load(original, { format: 'hwpx', editable: false });
  const readonly = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
  });
  assert.equal(
    readonly.captureSourceTableCellWidth(witness(editor), () => true),
    null,
  );
  assert.deepEqual(await save(editor), original);
});

test('width planning indexes source cells once without per-row filtering or sorting', () => {
  for (const count of [1024, 2048, 4096]) {
    let reads = 0;
    const cells = Array.from({ length: count }, (_, i) => ({
      listNode: i,
      row: i >> 1,
      column: i % 2,
      rowSpan: 1,
      columnSpan: 1,
      width: i % 2 ? 14000 : 6000,
      height: 2000,
      sourceMargin: { has_margin: false },
    })).reverse();
    const watched = new Proxy(cells, {
      get(target, key, receiver) {
        if (key === 'filter' || key === 'sort') throw Error('RepeatedRowScan');
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const table = {
      section: 0,
      tableNode: 1,
      rows: count / 2,
      columns: 2,
      cells: watched,
      sourceGeometry: { in_margin: [0, 0, 0, 0] },
    };
    const edits = sourceTableCellWidthPlan(table, {
      section: 0,
      tableNode: 1,
      expectedRows: table.rows,
      expectedColumns: 2,
      top: 0,
      left: 0,
      bottom: table.rows,
      right: 2,
    });
    assert.equal(edits.length, count);
    assert(edits.every((e) => e.width === 10000));
    assert(reads <= 3 * count, `source reads ${reads} for ${count} cells`);
  }
});
