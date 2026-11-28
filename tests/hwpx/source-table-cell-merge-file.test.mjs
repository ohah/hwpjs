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
