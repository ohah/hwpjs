import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createHwp5CellSplitFixture } from '../helpers/hwp5-cell-split-fixture.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { nativeArtifactExpectedSHA256 } from '../../packages/cli/tests/native-artifact-pin.mjs';

test('HWP5 Core 열린 표 병합의 저장·실행 취소·다시 실행', async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  assert.equal(createHash('sha256').update(wasm).digest('hex'), nativeArtifactExpectedSHA256());
  const module = await WebAssembly.compile(wasm);
  const bytes = await createHwp5CellSplitFixture(module);
  const { createEditor, MERGE_SOURCE_TABLE_CELLS_COMMAND, UNDO_COMMAND, REDO_COMMAND } =
    await import('../../packages/core/src/index.ts');
  const { createReaderRuntimeFactory } = await import('../../packages/core/src/runtime.ts');
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  try {
    await editor.load(bytes, { format: 'hwp5', editable: true });
    const lease = editor.acquireInputSurface({
      commitComposition: () => 'unchanged',
      cancelComposition() {},
    });
    const before = (await editor.save({ allowStaleLayout: true })).bytes;
    const { content } = editor.getEditorState();
    assert.equal(content.sourceTableCellMergeAvailable, true);
    const { section, tableNode, rows, columns, cells } = content.tables[0];
    const target = lease.captureSourceTableCellMerge(
      {
        section,
        tableNode,
        rows,
        columns,
        cells: cells
          .filter((cell) => cell.column < 2)
          .map(({ listNode, row, column, paragraphs }) => ({ listNode, row, column, paragraphs })),
      },
      () => true,
    );
    assert(target);
    const result = await editor.dispatchCommand(MERGE_SOURCE_TABLE_CELLS_COMMAND, target);
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
    const after = (await editor.save({ allowStaleLayout: true })).bytes;
    const reopened = await createExperimentalHwp5Editor(module, after);
    try {
      assert.deepEqual(
        reopened
          .tableBindings(0)
          .map((cell) => [
            cell.row,
            cell.column,
            cell.rowSpan,
            cell.columnSpan,
            reopened.text(0, cell.paragraph),
          ]),
        [[0, 0, 2, 2, 'A😀A\r']],
      );
    } finally {
      reopened.close();
    }
    assert.equal(
      (await editor.dispatchCommand(MERGE_SOURCE_TABLE_CELLS_COMMAND, target)).error,
      'StaleSourceTableCellMergeTarget',
    );
    await editor.dispatchCommand(UNDO_COMMAND, { token: editor.getEditorState().token });
    assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, before);
    await editor.dispatchCommand(REDO_COMMAND, { token: editor.getEditorState().token });
    assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, after);
  } finally {
    await editor.dispose();
  }
});
