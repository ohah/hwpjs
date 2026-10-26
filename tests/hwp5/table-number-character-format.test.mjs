import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import {
  inspect,
  records,
  paragraphRecords,
  verifyRaw,
} from './style-preservation/text-record-oracle.mjs';
import { verifyCharacterProperties } from './style-preservation/character-property-oracle.mjs';
import { tableNumberSourceOracle } from './table-number-source-oracle.mjs';
import { independentFieldSpans } from './field-span-oracle.mjs';

function declarations(bytes) {
  const source = tableNumberSourceOracle(bytes);
  // Record offsets belong to one serialization, not persistent object identity.
  // The complete byte oracle above separately checks their exact relocation.
  const identity = ({ offset: _serializationOffset, ...site }) => site;
  return {
    ...source,
    objects: source.objects.map(identity),
    tables: source.tables.map((row) => ({ ...row, object: identity(row.object) })),
  };
}

for (const name of ['hwpspec.hwp', 'hwp-3.0-HWPML.hwp']) {
  test(`${name}: formatting and isolated text retain table references and protected-section redo`, async (t) => {
    const path = `reference/rhwp/samples/${name}`;
    if (!existsSync(path)) {
      t.skip('RHWP reference fixture is unavailable');
      return;
    }
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
    const input = readFileSync(path),
      parsed = inspect(input);
    const paragraph = records(parsed.sections[0].bytes)
      .filter((row) => row.tag === 66)
      .findIndex((_, index) => {
        const owner = paragraphRecords(parsed.sections[0].bytes, index);
        const text = owner.direct.find(
          (row) => row.tag === 67 && row.level === owner.head.level + 1,
        )?.payload;
        return text?.length >= 4 && text.readUInt16LE(0) >= 32 && text.readUInt16LE(0) < 0xd800;
      });
    assert(paragraph >= 0);
    const owner = paragraphRecords(parsed.sections[0].bytes, paragraph);
    const shapeId = owner.direct.find((row) => row.tag === 68).payload.readUInt32LE(4);
    const shape = records(parsed.decode(parsed.streams.get('DocInfo'))).filter(
      (row) => row.tag === 21,
    )[shapeId];
    const bold = !(shape.payload.readUInt32LE(46) & 2);
    const options = { distribution: true, normalizeObservedCfb: true };
    const editor = await createExperimentalHwp5Editor(wasm, input, options);
    try {
      const baseline = Buffer.from(editor.save().bytes);
      editor.enableHistory();
      const request = { section: 0, paragraph, startUnit: 0, endUnit: 1, properties: { bold } };
      editor.setCharacterProperties(request);
      const saved = Buffer.from(editor.save({ allowStaleLayout: true }).bytes);
      assert.notDeepEqual(saved, baseline);
      assert.equal(verifyCharacterProperties(input, saved, request), true);
      assert.throws(
        () => verifyCharacterProperties(input, saved, { ...request, properties: { bold: !bold } }),
        assert.AssertionError,
      );
      assert.deepEqual(declarations(saved), declarations(input));
      const reopened = await createExperimentalHwp5Editor(wasm, saved, { distribution: true });
      try {
        assert.deepEqual(Buffer.from(reopened.save().bytes), saved);
      } finally {
        reopened.close();
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), baseline);
      const protectedSpan = independentFieldSpans(inspect(baseline).sections[2].bytes).find(
        (row) => row.field_id === 0x25787266,
      );
      assert(protectedSpan);
      assert.throws(
        () =>
          editor.splice({
            section: 2,
            paragraph: protectedSpan.begin.paragraph,
            startUnit: protectedSpan.begin.unit,
            endUnit: protectedSpan.begin.unit,
            text: '보호',
          }),
        /ReadOnlyCrossReferenceResult/,
      );
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save({ allowStaleLayout: true }).bytes), saved);
      const originalText = editor.text(0, paragraph);
      editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: '보존😀' });
      const textSaved = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(saved, textSaved, 0, paragraph, 0, 0, '보존😀');
      assert.equal(editor.text(0, paragraph), '보존😀' + originalText);
      assert.deepEqual(declarations(textSaved), declarations(input));
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save({ allowStaleLayout: true }).bytes), saved);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, textSaved);
    } finally {
      editor.close();
    }
    assert.deepEqual(readFileSync(path), input);
  });
}
