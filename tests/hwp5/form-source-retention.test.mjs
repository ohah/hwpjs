import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { inspect, expectedSection, records } from './style-preservation/text-record-oracle.mjs';
import { controlLinkEvidence } from './links.mjs';
import { formSourceFixtures } from './form-source-fixtures.mjs';

test('observed form documents retain complete independent sections through every paragraph prefix', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit form-retention candidate required');
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  let verified = 0;
  for (const { name, paragraphs: paragraphCount, forms: formCount } of formSourceFixtures) {
    const input = readFileSync(`reference/rhwp/samples/${name}`),
      before = inspect(input);
    const editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      editor.enableHistory();
      assert.equal(editor.sectionCount(), 1);
      assert.equal(editor.paragraphCount(0), paragraphCount);
      const immutable = records(before.sections[0].bytes).filter(
        (row) => row.tag === 91 || (row.tag === 71 && row.payload.readUInt32LE(0) === 0x666f726d),
      );
      assert.equal(immutable.length, formCount * 2);
      const headers = records(before.sections[0].bytes)
        .map((row, index) => (row.tag === 66 ? index : -1))
        .filter((index) => index >= 0);
      const form = controlLinkEvidence(before.sections[0].bytes).find(
        (row) => row[6] === 0x666f726d,
      );
      assert(form);
      assert.equal(form[4], 11);
      assert.equal(form[5], form[6]);
      const formParagraph = headers.indexOf(form[0]),
        formStart = form[3];
      assert(formParagraph >= 0);
      for (let paragraph = 0; paragraph < paragraphCount; paragraph++) {
        const text = '양식검증😀';
        editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text });
        const saved = editor.save({ allowStaleLayout: true }).bytes,
          after = inspect(saved);
        const expected = expectedSection(before.sections[0].bytes, paragraph, 0, 0, text, {
          fieldIds: [0x25636c6b],
        });
        assert.deepEqual(
          after.sections[0].bytes,
          expected,
          `${name}:${paragraph} complete section`,
        );
        assert.notDeepEqual(
          after.sections[0].bytes,
          expectedSection(before.sections[0].bytes, paragraph, 0, 0, 'wrong', {
            fieldIds: [0x25636c6b],
          }),
        );
        assert.deepEqual(
          records(after.sections[0].bytes)
            .filter(
              (row) =>
                row.tag === 91 || (row.tag === 71 && row.payload.readUInt32LE(0) === 0x666f726d),
            )
            .map((row) => row.raw),
          immutable.map((row) => row.raw),
        );
        assert.deepEqual(after.metadata, before.metadata);
        for (const [path, bytes] of before.streams)
          if (path !== before.sections[0].path)
            assert.deepEqual(after.streams.get(path), bytes, path);
        const reopened = await createExperimentalHwp5Editor(wasm, saved);
        try {
          assert.equal(reopened.paragraphCount(0), paragraphCount);
          for (let index = 0; index < paragraphCount; index++)
            assert.deepEqual(reopened.copyText(0, index), editor.copyText(0, index));
        } finally {
          reopened.close();
        }
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save().bytes), input);
        for (const [startUnit, endUnit, error] of [
          [formStart, formStart + 8, 'UnsupportedControlDeletion'],
          [formStart + 1, formStart + 1, 'SplitControlToken'],
        ]) {
          assert.throws(
            () =>
              editor.splice({ section: 0, paragraph: formParagraph, startUnit, endUnit, text: '' }),
            (failure) => failure.message === error,
          );
          assert.deepEqual(
            Buffer.from(editor.save().bytes),
            input,
            'rejected form-token edit must preserve source and redo',
          );
        }
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save().bytes), input);
        verified++;
      }
    } finally {
      editor.close();
    }
  }
  assert.equal(verified, 1446);
  t.diagnostic(
    '7 original documents, 214 form objects, 1446 complete independent Section/CFB/history checkpoints; no layout proof',
  );
});
