import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { verifyRaw } from './style-preservation/text-record-oracle.mjs';

assert(process.env.HWPJS_TEST_WASM, 'Explicit retained protection candidate required');
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
const semantic = (value) => ({
  spans: value.spans,
  unresolved: value.unresolved.map(({ list_node: _serializationListNode, ...row }) => row),
});

test('retained click repeated replacements deletion and reopened editing preserve independent source and barriers', async () => {
  const input = readFileSync('reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp');
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    const topology = editor.fieldTopology(0),
      protection = editor.textSourceProtection(0);
    let before = input;
    for (const [endUnit, text] of [
      [0, '첫😀'],
      [3, '둘'],
      [1, ''],
    ]) {
      editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit, text });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(before, saved, 0, 0, 0, endUnit, text, { skipLocalFieldAttributes: true });
      assert.deepEqual(editor.fieldTopology(0), topology);
      assert.deepEqual(editor.textSourceProtection(0), protection);
      if (text === '첫😀') {
        assert.throws(
          () => editor.splice({ section: 0, paragraph: 0, startUnit: 2, endUnit: 2, text: 'X' }),
          /SplitSurrogatePair/,
        );
        assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      }
      before = saved;
    }
    assert.equal(editor.undo(), true);
    const pending = editor.save({ allowStaleLayout: true }).bytes;
    assert.throws(
      () => editor.splice({ section: 0, paragraph: 52, startUnit: 0, endUnit: 0, text: '거부' }),
      /UnsupportedCrossParagraphField/,
    );
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, pending);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, before);
    const reopened = await createExperimentalHwp5Editor(wasm, before);
    try {
      assert.deepEqual(semantic(reopened.fieldTopology(0)), semantic(topology));
      assert.deepEqual(reopened.textSourceProtection(0), protection);
      reopened.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: '재열기😀' });
      const saved = reopened.save({ allowStaleLayout: true }).bytes;
      verifyRaw(before, saved, 0, 0, 0, 0, '재열기😀', { skipLocalFieldAttributes: true });
      assert.throws(
        () =>
          reopened.splice({ section: 0, paragraph: 52, startUnit: 0, endUnit: 0, text: '거부' }),
        /UnsupportedCrossParagraphField/,
      );
      assert.deepEqual(reopened.save({ allowStaleLayout: true }).bytes, saved);
    } finally {
      reopened.close();
    }
  } finally {
    editor.close();
  }
});
