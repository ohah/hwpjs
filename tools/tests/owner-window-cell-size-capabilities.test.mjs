import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime/reader-runtime.ts';
import { isPlainOwnerBaseline } from '../../packages/core/src/internal/owner-window-cow.ts';
import { ownObservation } from '../../packages/core/src/state/owned.ts';
assert(process.env.HWPJS_TEST_WASM && process.env.HWPJS_TEST_NOORI, 'ExplicitNativeInputsRequired');
test('actual HWP5 cell-size capabilities retain plain-owner admission and reject malformed or unknown additions', async () => {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({
      wasmModule: await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM)),
    }),
  });
  try {
    await editor.load(readFileSync(process.env.HWPJS_TEST_NOORI), {
      format: 'hwp5',
      editable: true,
    });
    const state = editor.getEditorState();
    assert.equal(state.content.sourceTableCellWidthAvailable, true);
    assert.equal(state.content.sourceTableCellHeightAvailable, true);
    assert.equal(isPlainOwnerBaseline(state.content, 0, 15), true);
    const probe = (extra) =>
      isPlainOwnerBaseline(ownObservation({ ...state.content, ...extra })(), 0, 15);
    for (const key of [
      'sourceTableCellWidthAvailable',
      'sourceTableCellHeightAvailable',
      'sourceTableCellSplitAvailable',
    ]) {
      for (const value of [true, false]) assert.equal(probe({ [key]: value }), true);
      for (const value of [undefined, null, 0, 1, '', 'true', {}, []])
        assert.equal(probe({ [key]: value }), false);
    }
    assert.equal(state.content.sourceTableCellSplitAvailable, true);
    assert.equal(state.content.sourceTableCellSplitProfile, 'single-unmerged-source-cell');
    assert.equal(probe({ sourceTableCellSplitProfile: 'single-unmerged-source-cell' }), true);
    for (const value of [undefined, null, false, '', 'static-source-cell-rectangle', {}, []])
      assert.equal(probe({ sourceTableCellSplitProfile: value }), false);
    assert.equal(probe({ futureCellCapability: true }), false);
    assert.equal(editor.getEditorState(), state);
    assert.equal(state.nativeHistoryRevision, 0);
  } finally {
    await editor.dispose();
  }
});
