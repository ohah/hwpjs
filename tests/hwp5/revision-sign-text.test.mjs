import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { inspect, verifyRaw } from './style-preservation/text-record-oracle.mjs';
import { independentFieldSpans } from './field-span-oracle.mjs';

assert(process.env.HWPJS_TEST_WASM, 'Explicit revision-sign retention candidate required');
test('actual empty revision sign retains source across late-body and marker-paragraph text edits', async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  const path =
    'reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp';
  const input = readFileSync(path),
    editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
    editor.validateTextSourcePolicy(0);
    const fields = editor.fieldSpans(0),
      signature = fields.find((row) => row.field_id === 0x25736967);
    assert(signature);
    assert.deepEqual(signature.begin, signature.end);
    for (const paragraph of [50000, signature.begin.paragraph]) {
      const old = editor.text(0, paragraph),
        marker = '원문보존😀';
      editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: marker });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(input, saved, 0, paragraph, 0, 0, marker, { skipLocalFieldAttributes: true });
      const source = inspect(saved);
      assert.deepEqual(source.metadata, inspect(input).metadata);
      const expected = independentFieldSpans(source.sections[0].bytes, {
        additionalKinds: [0x25756e6b, 0x25736967],
      });
      assert.deepEqual(editor.fieldSpans(0), expected);
      assert.equal(editor.text(0, paragraph), marker + old);
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try {
        assert.deepEqual(reopened.fieldSpans(0), expected);
        assert.deepEqual(Buffer.from(reopened.save().bytes), Buffer.from(saved));
      } finally {
        reopened.close();
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.throws(
        () =>
          editor.splice({
            section: 0,
            paragraph: signature.begin.paragraph,
            startUnit: signature.begin.unit,
            endUnit: signature.begin.unit,
            text: '거부',
          }),
        /ReadOnlyRetainedFieldResult/,
      );
      assert.throws(
        () =>
          editor.setCharacterProperties({
            section: 0,
            paragraph: 50000,
            startUnit: 0,
            endUnit: 1,
            properties: { bold: true },
          }),
        /UnsupportedSectionControl/,
      );
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      assert.equal(editor.undo(), true);
    }
  } finally {
    editor.close();
  }
  assert.deepEqual(readFileSync(path), input);
});
