import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { editDocumentTableGrid } from '../../packages/cli/src/edit-table-grid.ts';
import { createCellWidthFixture } from '../helpers/source-table-cell-width-fixture.mjs';

const path = process.env.HWPJS_TEST_WASM;
assert(path, 'Explicit HWPJS_TEST_WASM required');
const wasm = readFileSync(path);
const module = await WebAssembly.compile(wasm);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('HWPX file merge retains every selected cell paragraph in row order', async () => {
  const fixture = await createCellWidthFixture(module);
  const editor = await createHwpxEditor(module);
  try {
    editor.open(fixture);
    const cells = editor.tableBindings(0);
    assert.equal(cells.length, 4);
    const labels = ['첫째', '둘째😀', '셋째', '넷째'];
    for (const { paragraph, row, column } of cells)
      editor.splice(0, paragraph, 0, 0, labels[row * 2 + column]);
    const source = editor.save();
    const sourceSha256 = digest(source);
    const { tableNode } = editor.tableBindings(0)[0];
    const request = {
      bytes: source,
      wasm,
      reference: `hwpjs-object:${sourceSha256}/hwpx/s0/table/${tableNode}`,
      action: 'merge',
      range: '0,0:1,1',
      expectedRows: 2,
      expectedColumns: 2,
      layout: 'spec6',
    };
    await assert.rejects(
      editDocumentTableGrid({ ...request, expectedColumns: 3 }),
      /TableGridDimensionsMismatch/,
    );
    const result = await editDocumentTableGrid(request);
    assert.equal(result.sourceSha256, sourceSha256);
    assert.equal(digest(source), sourceSha256);
    assert.equal(result.previewStale, true);
    assert.equal(result.layoutRequiresReflow, true);
    const reopened = await createHwpxEditor(module);
    try {
      reopened.open(result.bytes);
      const bindings = reopened.tableBindings(0);
      assert.equal(bindings.length, 4);
      assert.equal(new Set(bindings.map((cell) => cell.listNode)).size, 1);
      const text = new Map(
        reopened.paragraphTextSnapshot(0).map((row) => [row.paragraph, row.text]),
      );
      assert.deepEqual(
        bindings.map((cell) => [
          cell.row,
          cell.column,
          cell.rowSpan,
          cell.columnSpan,
          text.get(cell.paragraph),
        ]),
        labels.map((label) => [0, 0, 2, 2, label]),
      );
    } finally {
      reopened.close();
    }
  } finally {
    editor.close();
  }
});

test('HWPX file merge preserves an existing disjoint span and rejects partial overlap', async () => {
  async function merge(source, range) {
    const editor = await createHwpxEditor(module);
    try {
      editor.open(source);
      const { tableNode } = editor.tableBindings(0)[0];
      return await editDocumentTableGrid({
        bytes: source,
        wasm,
        reference: `hwpjs-object:${digest(source)}/hwpx/s0/table/${tableNode}`,
        action: 'merge',
        range,
        expectedRows: 2,
        expectedColumns: 2,
      });
    } finally {
      editor.close();
    }
  }

  const original = await createCellWidthFixture(module);
  const { bytes: first } = await merge(original, '0,0:0,1');
  await assert.rejects(merge(first, '0,1:1,1'), /MergedSourceTable/);
  const { bytes: second } = await merge(first, '1,0:1,1');
  const reopened = await createHwpxEditor(module);
  try {
    reopened.open(second);
    const cells = reopened.tableBindings(0);
    const shapes = [...new Map(cells.map((cell) => [cell.listNode, cell])).values()];
    assert.deepEqual(
      shapes.map((c) => [c.row, c.column, c.rowSpan, c.columnSpan, c.width, c.height]),
      [
        [0, 0, 1, 2, 20000, 2000],
        [1, 0, 1, 2, 20000, 2000],
      ],
    );
  } finally {
    reopened.close();
  }
});

test('HWPX Core can merge two disjoint rows and undo only the second merge', async () => {
  const { createEditor, MERGE_SOURCE_TABLE_CELLS_COMMAND, UNDO_COMMAND, REDO_COMMAND } =
    await import('../../packages/core/src/index.ts');
  const { createReaderRuntimeFactory } = await import('../../packages/core/src/runtime.ts');
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  try {
    await editor.load(await createCellWidthFixture(module), { format: 'hwpx', editable: true });
    const surface = editor.acquireInputSurface({
      commitComposition: () => 'unchanged',
      cancelComposition() {},
    });
    const capture = (filter) => {
      const { content } = editor.getEditorState();
      const { section, tableNode, rows, columns, cells } = content.tables[0];
      return surface.captureSourceTableCellMerge(
        {
          section,
          tableNode,
          rows,
          columns,
          cells: cells.filter(filter).map(({ listNode, row, column, paragraphs }) => ({
            listNode,
            row,
            column,
            paragraphs,
          })),
        },
        () => true,
      );
    };
    const first = capture((cell) => cell.row === 0);
    assert(first);
    let result = await editor.dispatchCommand(MERGE_SOURCE_TABLE_CELLS_COMMAND, first);
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    const before = (await editor.save()).bytes;
    assert.equal(
      capture(() => true),
      null,
    );
    const second = capture((cell) => cell.row === 1);
    assert(second);
    result = await editor.dispatchCommand(MERGE_SOURCE_TABLE_CELLS_COMMAND, second);
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    assert.equal(editor.getEditorState().nativeHistoryRevision, 2);
    const after = (await editor.save()).bytes;
    await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
    assert.deepEqual((await editor.save()).bytes, before);
    await editor.dispatchCommand(REDO_COMMAND, { token: editor.getEditorState().token });
    assert.deepEqual((await editor.save()).bytes, after);
  } finally {
    await editor.dispose();
  }
});
