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
    assert.equal(state.content.originalCellVerticalAlignmentBatchAvailable, true);
    assert.equal(isPlainOwnerBaseline(state.content, 0, 15), true);
    const probe = (extra) =>
      isPlainOwnerBaseline(ownObservation({ ...state.content, ...extra })(), 0, 15);
    for (const key of [
      'sourceTableCellWidthAvailable',
      'sourceTableCellHeightAvailable',
      'sourceTableCellSplitAvailable',
      'sourceTableCellMergeAvailable',
    ]) {
      for (const value of [true, false]) assert.equal(probe({ [key]: value }), true);
      for (const value of [undefined, null, 0, 1, '', 'true', {}, []])
        assert.equal(probe({ [key]: value }), false);
    }
    assert.equal(state.content.sourceTableCellSplitAvailable, true);
    assert.equal(state.content.sourceTableCellSplitProfile, 'single-source-cell-with-spans');
    assert.equal(probe({ sourceTableCellSplitProfile: 'single-source-cell-with-spans' }), true);
    assert.equal(probe({ sourceTableCellSplitProfile: 'single-unmerged-source-cell' }), true);
    for (const value of [undefined, null, false, '', 'static-source-cell-rectangle', {}, []])
      assert.equal(probe({ sourceTableCellSplitProfile: value }), false);
    for (const key of [
      'imageInsertionAvailable',
      'hwp5ChartLiteralEditAvailable',
      'equationInsertionAvailable',
      'chartCreationAvailable',
      'strictMeasuredSaveAvailable',
      'originalCellVerticalAlignmentBatchAvailable',
    ]) {
      for (const value of [true, false]) assert.equal(probe({ [key]: value }), true);
      for (const value of [undefined, null, 0, 1, '', 'true', {}, []])
        assert.equal(probe({ [key]: value }), false);
    }
    for (const value of [0, 1, 2, 3, 4])
      assert.equal(probe({ hwp5ChartCreateProfileVersion: value }), true);
    for (const value of [
      undefined,
      null,
      false,
      true,
      -0,
      -1,
      5,
      1.5,
      '0',
      '1',
      '2',
      '3',
      '4',
      {},
      [],
    ])
      assert.equal(probe({ hwp5ChartCreateProfileVersion: value }), false);
    // Recognized exact boolean observations do not grant Native image/chart authority.
    // Unsupported and unknown metadata remain rejected below.
    assert.equal(isPlainOwnerBaseline(Object.freeze({ ...state.content }), 0, 15), false);
    assert.equal(probe({ futureCellCapability: true }), false);
    for (const key of [
      'equationAvailable',
      'equationPaintAvailable',
      'equationSourceStylesAvailable',
    ]) {
      for (const value of [true, false]) assert.equal(probe({ [key]: value }), true);
      for (const value of [undefined, null, 0, 1, '', 'true', {}, []])
        assert.equal(probe({ [key]: value }), false);
    }
    for (const key of ['equationErrors', 'equationPaintErrors', 'equationPaintWarnings']) {
      assert.equal(probe({ [key]: [] }), true);
      for (const value of [undefined, null, false, 0, '', {}, [{ section: 0 }]])
        assert.equal(probe({ [key]: value }), false);
    }
    for (const index of [0, 15])
      for (const key of ['equations', 'equationPaint']) {
        const paragraphProbe = (value) =>
          probe({
            paragraphs: state.content.paragraphs.map((row, at) =>
              at === index ? { ...row, [key]: value } : row,
            ),
          });
        assert.equal(paragraphProbe([]), true);
        for (const value of [undefined, null, false, 0, '', {}, [{ node: 1, unit: 0 }]])
          assert.equal(paragraphProbe(value), false);
      }
    const legacy = { ...state.content };
    for (const key of [
      'equationAvailable',
      'equationPaintAvailable',
      'equationSourceStylesAvailable',
      'equationErrors',
      'equationPaintErrors',
      'equationPaintWarnings',
    ])
      delete legacy[key];
    legacy.paragraphs = legacy.paragraphs.map(
      ({ equations: _equations, equationPaint: _equationPaint, ...row }) => row,
    );
    assert.equal(isPlainOwnerBaseline(ownObservation(legacy)(), 0, 15), true);
    assert.equal(probe({ futureEquationCapability: true }), false);
    assert.equal(editor.getEditorState(), state);
    assert.equal(state.nativeHistoryRevision, 0);
  } finally {
    await editor.dispose();
  }
});
