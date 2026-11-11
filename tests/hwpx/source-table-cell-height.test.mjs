import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import {
  EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND as HEIGHT,
  EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND as WIDTH,
  MERGE_SOURCE_TABLE_CELLS_COMMAND as MERGE,
  SPLIT_SOURCE_TABLE_CELLS_COMMAND as SPLIT,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../packages/core/src/commands/commands.ts';
import { createCellHeightFixture } from '../helpers/source-table-cell-height-fixture.mjs';
import { measureSourceTableCellHeights } from '../../web/preview/source-table-cell-height-measurement.mjs';
import { sourceTableCellHeightPlan } from '../../web/preview/source-table-cell-height.mjs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';

const module = await WebAssembly.compile(
  readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
);
const original = await createCellHeightFixture(module);
const create = async (t, { source = original, hooks = {} } = {}) => {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  t.after(() => editor.dispose());
  await editor.load(source, { format: 'hwpx', editable: true });
  const lease = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
    ...hooks,
  });
  return { editor, lease };
};
const rect = (table, top = 0, bottom = 2) => ({
  section: table.section,
  tableNode: table.tableNode,
  expectedRows: table.rows,
  expectedColumns: table.columns,
  top,
  left: 0,
  bottom,
  right: table.columns,
});
const witness = (editor, top = 0, bottom = 2) => {
  const table = editor.getEditorState().content.tables[0];
  return {
    section: table.section,
    tableNode: table.tableNode,
    rows: table.rows,
    columns: table.columns,
    cells: table.cells
      .filter((c) => c.row >= top && c.row < bottom)
      .map(({ listNode, row, column, paragraphs }) => ({ listNode, row, column, paragraphs })),
  };
};
const minima = (editor, top = 0, bottom = 2, height = 12) => {
  const content = editor.getEditorState().content,
    table = content.tables[0],
    measure = () => ({ width: 8, height });
  return measureSourceTableCellHeights(content, table, rect(table, top, bottom), measure, (next) =>
    layoutPageContent(next, measure),
  );
};
const save = async (editor) => (await editor.save()).bytes;
const dispatch = async (editor, command) =>
  editor.dispatchCommand(command, { token: editor.getEditorState().token });
function oracle(before, after, rectangle, heights) {
  const request = {
    before: Buffer.from(before).toString('base64'),
    after: Buffer.from(after).toString('base64'),
    part: 'Contents/section0.xml',
    rectangle,
    heights,
  };
  for (const flags of [[], ['-O']]) {
    const path = new URL('../../tools/hwpx-cell-height-oracle.py', import.meta.url).pathname;
    const result = JSON.parse(
      execFileSync('python3', [...flags, path], {
        input: JSON.stringify(request),
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );
    assert.equal(result.cells, (rectangle[2] - rectangle[0]) * 2);
    assert.throws(
      () =>
        execFileSync('python3', [...flags, path], {
          input: JSON.stringify({ ...request, heights: heights.map((h) => h + 1) }),
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      (error) => error.status === 1,
    );
  }
}
for (const [name, top, bottom, heights] of [
  ['first-band', 0, 2, [3000, 3000]],
  ['last-band', 1, 3, [3750, 3750]],
  ['whole-table', 0, 3, [3000, 3000, 3000]],
]) {
  test(name + ' uses real source measurement and atomic exact history/XML/reopen', async (t) => {
    const { editor, lease } = await create(t);
    const before = await save(editor);
    const table = editor.getEditorState().content.tables[0];
    const minimums = minima(editor, top, bottom);
    assert(minimums.every((m) => m.height === 900));
    const target = lease.captureSourceTableCellHeight(
      witness(editor, top, bottom),
      minimums,
      () => true,
    );
    assert(target);
    const result = await editor.dispatchCommand(HEIGHT, target);
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
    const after = await save(editor);
    oracle(before, after, [top, 0, bottom, table.columns], heights);
    await dispatch(editor, UNDO_COMMAND);
    assert.deepEqual(await save(editor), before);
    await dispatch(editor, REDO_COMMAND);
    assert.deepEqual(await save(editor), after);
    await editor.load(after, { format: 'hwpx', editable: true });
    assert.deepEqual(await save(editor), after);
  });
}
test('intrinsic height includes actual line flow, source margins, and rejects overflow without editing', async (t) => {
  const source = await createCellHeightFixture(module, {
    text: ['line1', 'line2', 'line3', 'line4', 'line5', 'line6'].join(String.fromCharCode(10)),
  });
  const { editor, lease } = await create(t, { source });
  const before = await save(editor);
  assert.throws(() => minima(editor), /ContentOverflow/);
  const w = witness(editor);
  const fake = w.cells.map((c) => ({ listNode: c.listNode, height: 3001 }));
  assert.equal(
    lease.captureSourceTableCellHeight(w, fake, () => true),
    null,
  );
  assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
  assert.deepEqual(await save(editor), before);
});
test('geometry and measurement remain read-only and mixed row spans are refused', async (t) => {
  const { editor, lease } = await create(t);
  const content = editor.getEditorState().content;
  const before = JSON.stringify(content);
  minima(editor);
  assert.equal(JSON.stringify(content), before);
  const table = content.tables[0],
    request = { ...rect(table), minimums: minima(editor) };
  for (const cell of [
    { ...table.cells[0], rowSpan: 2 },
    { ...table.cells[0], columnSpan: 2 },
  ]) {
    const mixed = { ...table, cells: [cell, ...table.cells.slice(1)] };
    assert.throws(() => sourceTableCellHeightPlan(mixed, request), /Spans/);
  }
  const conflicting = structuredClone(table);
  conflicting.cells[0].height++;
  assert.throws(
    () => sourceTableCellHeightPlan(conflicting, request),
    /ConflictingSourceTableRowHeights/,
  );
  assert.equal(
    lease.captureSourceTableCellHeight(
      { ...witness(editor), cells: witness(editor).cells.slice(0, 2) },
      minima(editor),
      () => true,
    ),
    null,
  );
});
test('opaque target expires on selection, state, detach and never borrows width or merge authority', async (t) => {
  const a = await create(t),
    b = await create(t);
  let live = true;
  const w = witness(a.editor),
    m = minima(a.editor);
  const target = a.lease.captureSourceTableCellHeight(w, m, () => live);
  assert(target);
  assert.equal(
    (await b.editor.dispatchCommand(HEIGHT, target)).error,
    'ForeignSourceTableCellHeightTarget',
  );
  assert.equal(
    (await a.editor.dispatchCommand(HEIGHT, { ...target })).error,
    'ForeignSourceTableCellHeightTarget',
  );
  assert.equal(
    (await a.editor.dispatchCommand(WIDTH, target)).error,
    'ForeignSourceTableCellWidthTarget',
  );
  assert.equal(
    (await a.editor.dispatchCommand(MERGE, target)).error,
    'ForeignSourceTableCellMergeTarget',
  );
  live = false;
  assert.equal(
    (await a.editor.dispatchCommand(HEIGHT, target)).error,
    'StaleSourceTableCellHeightTarget',
  );
  live = true;
  assert.equal(
    (await a.editor.dispatchCommand(HEIGHT, target)).error,
    'StaleSourceTableCellHeightTarget',
  );
  const fresh = a.lease.captureSourceTableCellHeight(w, m, () => true);
  a.lease.release();
  assert.equal(
    (await a.editor.dispatchCommand(HEIGHT, fresh)).error,
    'StaleSourceTableCellHeightTarget',
  );
  assert.deepEqual(await save(a.editor), original);
});
test('composition settlement rechecks measured selection before Native admission', async (t) => {
  const gate = Promise.withResolvers(),
    entered = Promise.withResolvers();
  let live = true;
  const { editor, lease } = await create(t, {
    hooks: {
      commitComposition() {
        entered.resolve();
        return gate.promise;
      },
    },
  });
  const target = lease.captureSourceTableCellHeight(witness(editor), minima(editor), () => live);
  const pending = editor.dispatchCommand(HEIGHT, target);
  await entered.promise;
  live = false;
  gate.resolve('unchanged');
  assert.equal((await pending).error, 'StaleSourceTableCellHeightTarget');
  assert.deepEqual(await save(editor), original);
});
test('no-op keeps a pending redo branch', async (t) => {
  const { editor, lease } = await create(t);
  const target = lease.captureSourceTableCellHeight(witness(editor), minima(editor), () => true);
  await editor.dispatchCommand(HEIGHT, target);
  const sized = await save(editor);
  const merge = lease.captureSourceTableCellMerge(witness(editor), () => true);
  assert(merge);
  assert.equal((await editor.dispatchCommand(MERGE, merge)).status, 'committed-with-snapshot');
  const merged = await save(editor);
  await dispatch(editor, UNDO_COMMAND);
  assert.deepEqual(await save(editor), sized);
  const noop = lease.captureSourceTableCellHeight(witness(editor), minima(editor), () => true);
  assert(noop);
  assert.equal((await editor.dispatchCommand(HEIGHT, noop)).status, 'known-no-op');
  await dispatch(editor, REDO_COMMAND);
  assert.deepEqual(await save(editor), merged);
});

test('real mixed row-span source is rejected with exact bytes and no new history', async (t) => {
  const { createMixedHeightFixture } =
    await import('../helpers/source-table-cell-height-fixture.mjs');
  const source = await createMixedHeightFixture(module);
  const { editor, lease } = await create(t, { source });
  const w = witness(editor);
  const table = editor.getEditorState().content.tables[0];
  assert(table.cells.some((cell) => cell.rowSpan === 2));
  assert.throws(() => minima(editor), /Spans/);
  const minimums = w.cells.map((c) => ({ listNode: c.listNode, height: 0 }));
  assert.equal(
    lease.captureSourceTableCellHeight(w, minimums, () => true),
    null,
  );
  assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
  assert.deepEqual(await save(editor), source);
});
test('one HU remainder keeps band sum and all unselected XML exact', async (t) => {
  const source = await createCellHeightFixture(module, { heights: [1500, 4501, 2999] });
  const { editor, lease } = await create(t, { source });
  const target = lease.captureSourceTableCellHeight(witness(editor), minima(editor), () => true);
  assert(target);
  assert.equal((await editor.dispatchCommand(HEIGHT, target)).status, 'committed-with-snapshot');
  oracle(source, await save(editor), [0, 0, 2, 2], [3001, 3000]);
});
test('measurement snapshots are owned and readonly sources cannot mint height targets', async (t) => {
  const { editor, lease } = await create(t);
  const w = structuredClone(witness(editor)),
    m = minima(editor);
  const target = lease.captureSourceTableCellHeight(w, m, () => true);
  assert(target);
  m[0].height = 4000000000;
  w.cells[0].paragraphs.length = 0;
  assert.equal((await editor.dispatchCommand(HEIGHT, target)).status, 'committed-with-snapshot');
  lease.release();
  await editor.load(original, { format: 'hwpx', editable: false });
  const readonly = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
  });
  const block = witness(editor);
  assert.equal(
    readonly.captureSourceTableCellHeight(
      block,
      block.cells.map((c) => ({ listNode: c.listNode, height: 0 })),
      () => true,
    ),
    null,
  );
});
test('real Native commit with a mismatched reply needs refresh and never retries', async (t) => {
  const { createReaderEditorRuntime } = await import('../../packages/core/src/runtime.ts');
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
      if (message.kind === 'source-table-cell-height') {
        writes++;
        return { ...reply, kind: 'mismatched-height' };
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
  const target = lease.captureSourceTableCellHeight(witness(editor), minima(editor), () => true);
  assert(target);
  assert.equal((await editor.dispatchCommand(HEIGHT, target)).status, 'committed-refresh-required');
  assert.equal(writes, 1);
  assert.equal(
    (await editor.dispatchCommand(HEIGHT, target)).error,
    'StaleSourceTableCellHeightTarget',
  );
  assert.equal(writes, 1);
  await editor.refresh();
  oracle(original, await save(editor), [0, 0, 2, 2], [3000, 3000]);
});
test('last line pitch and active source margins determine the content minimum', async () => {
  const { measureTableCells } = await import('../../web/preview/table-cell-measurement.mjs');
  const paragraph = {
    section: 0,
    paragraph: 0,
    text: 'A' + String.fromCharCode(10) + 'B',
    editable: true,
    tableCell: { tableNode: 1, listNode: 2 },
    paragraphShape: { spacingFormat: 'hwpx', legacySpacingKind: 0, legacySpacing: 160 },
  };
  const table = {
    section: 0,
    tableNode: 1,
    rows: 1,
    columns: 1,
    sourceGeometry: { in_margin: [0, 0, 150, 225] },
    cells: [
      {
        listNode: 2,
        row: 0,
        column: 0,
        rowSpan: 1,
        columnSpan: 1,
        width: 15000,
        height: 0,
        sourceMargin: { has_margin: false },
        paragraphs: [0],
      },
    ],
  };
  const measure = () => ({ width: 8, height: 12 });
  const measured = measureTableCells(table, [paragraph], measure, {
    origin: { x: 0, y: 0 },
    padding: 'source',
  });
  assert.equal(measured.state, 'measured', measured.error);
  assert(Math.abs(measured.grid.height - (19.2 + 12 + 5)) < 1e-8);
  table.cells[0].sourceMargin = { has_margin: true, margin: [0, 0, 300, 300] };
  const own = measureTableCells(table, [paragraph], measure, {
    origin: { x: 0, y: 0 },
    padding: 'source',
  });
  assert.equal(own.state, 'measured', own.error);
  assert(Math.abs(own.grid.height - (19.2 + 12 + 8)) < 1e-8);
});

test('two queued clicks apply one batch and reject the second stale selection', async (t) => {
  const { editor, lease } = await create(t);
  const target = lease.captureSourceTableCellHeight(witness(editor), minima(editor), () => true);
  assert(target);
  const [first, second] = await Promise.all([
    editor.dispatchCommand(HEIGHT, target),
    editor.dispatchCommand(HEIGHT, target),
  ]);
  assert.equal(first.status, 'committed-with-snapshot');
  assert.equal(second.status, 'rejected-unapplied');
  assert.match(second.error, /Stale/);
  assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
  oracle(original, await save(editor), [0, 0, 2, 2], [3000, 3000]);
  await dispatch(editor, UNDO_COMMAND);
  assert.deepEqual(await save(editor), original);
});

test('explicit source zero height is measured without inventing a stored default', async (t) => {
  const source = await createCellHeightFixture(module, { heights: [0, 6000, 3000] });
  const { editor, lease } = await create(t, { source });
  const table = editor.getEditorState().content.tables[0];
  assert.equal(table.cells[0].height, 0);
  const minimums = minima(editor);
  assert(minimums[0].height > 0);
  const target = lease.captureSourceTableCellHeight(witness(editor), minimums, () => true);
  assert(target);
  assert.equal((await editor.dispatchCommand(HEIGHT, target)).status, 'committed-with-snapshot');
  oracle(source, await save(editor), [0, 0, 2, 2], [3000, 3000]);
  await dispatch(editor, UNDO_COMMAND);
  assert.deepEqual(await save(editor), source);
});

test('height and current split capture cannot borrow each other authority or disturb history', async (t) => {
  const { editor, lease } = await create(t);
  const before = await save(editor);
  const height = lease.captureSourceTableCellHeight(witness(editor), minima(editor), () => true);
  const split = lease.captureSourceTableCellSplit(witness(editor), () => true);
  assert(height);
  assert(split);
  assert.equal(
    (await editor.dispatchCommand(HEIGHT, split.target)).error,
    'ForeignSourceTableCellHeightTarget',
  );
  assert.equal(
    (
      await editor.dispatchCommand(SPLIT, {
        target: height,
        rows: 1,
        columns: 2,
        mode: 'each',
        equalizeRows: true,
      })
    ).error,
    'ForeignSourceTableCellSplitTarget',
  );
  assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
  assert.deepEqual(await save(editor), before);
  const fresh = lease.captureSourceTableCellHeight(witness(editor), minima(editor), () => true);
  assert.equal((await editor.dispatchCommand(HEIGHT, fresh)).status, 'committed-with-snapshot');
  assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
  await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
  assert.deepEqual(await save(editor), before);
});

test('candidate projection rejects nonnumeric heights and duplicate source boxes', async (t) => {
  const { editor } = await create(t);
  const content = editor.getEditorState().content,
    table = content.tables[0];
  const measure = () => ({ width: 8, height: 12 });
  for (const height of [NaN, Infinity, -1, undefined, '40']) {
    assert.throws(
      () =>
        measureSourceTableCellHeights(content, table, rect(table, 0, 2), measure, (next) => {
          const layout = layoutPageContent(next, measure);
          const index = layout.boxes.findIndex(
            (b) =>
              b.section === table.section &&
              b.tableNode === table.tableNode &&
              b.listNode === table.cells[0].listNode &&
              !b.previewOnly,
          );
          assert(index >= 0);
          const boxes = [...layout.boxes];
          boxes[index] = { ...boxes[index], height };
          return { ...layout, boxes };
        }),
      /SourceTableCellHeightLayoutOverflow/,
    );
  }
  assert.throws(
    () =>
      measureSourceTableCellHeights(content, table, rect(table, 0, 2), measure, (next) => {
        const layout = layoutPageContent(next, measure);
        const first = layout.boxes.find(
          (b) =>
            b.section === table.section &&
            b.tableNode === table.tableNode &&
            b.listNode === table.cells[0].listNode &&
            !b.previewOnly,
        );
        assert(first);
        return { ...layout, boxes: [...layout.boxes, first] };
      }),
    /SourceTableCellHeightLayoutOverflow/,
  );
});
