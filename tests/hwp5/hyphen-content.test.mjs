import assert from 'node:assert/strict';
import test from 'node:test';
import {
  retainedTextView,
  sourceTextChange,
  sourceDisplayPosition,
} from '../../web/preview/text-offsets.mjs';
import { displayContent } from '../../web/preview/content.mjs';
import { readFileSync } from 'node:fs';
import { createHwp5Reader } from '../../js/hwp5.mjs';

test('hyphen display retains a distinct soft-hyphen source unit and both edit boundaries', () => {
  const paragraph = {
    textPresent: true,
    text: 'ab',
    declaredUnits: 4,
    parentNodeIndex: null,
    tokens: [
      { type: 'text', startUnit: 0, text: 'a', raw: new Uint8Array([97, 0]) },
      { type: 'control', startUnit: 1, code: 24, raw: new Uint8Array([24, 0]) },
      { type: 'text', startUnit: 2, text: 'b', raw: new Uint8Array([98, 0]) },
      { type: 'control', startUnit: 3, code: 13, raw: new Uint8Array([13, 0]) },
    ],
  };
  const original = structuredClone(paragraph);
  const view = retainedTextView(paragraph);
  assert.equal(view.text, 'a\u00adb');
  assert.notEqual(view.text, 'a-b');
  for (let unit = 0; unit <= 3; unit++) {
    assert.equal(sourceDisplayPosition(unit, view.offsets, 3), unit);
    assert.deepEqual(
      sourceTextChange({ startUnit: unit, endUnit: unit, text: '검증' }, view.offsets),
      { startUnit: unit, endUnit: unit, text: '검증' },
    );
  }
  const result = { version: [5, 0, 0, 0], sections: [{ index: 0, paragraphs: [paragraph] }] };
  assert.equal(displayContent(result).paragraphs[0].editable, true);
  assert.equal(displayContent(result).paragraphs[0].text, view.text);
  assert.equal(displayContent(result, { maxUnits: 2 }).paragraphs[0].editable, false);
  assert.equal(displayContent(result, { maxUnits: 2 }).paragraphs[0].sourceOffsets, undefined);
  for (const length of [0, 1, 4, 16]) {
    const tokens = paragraph.tokens.map((token, index) =>
      index === 1 ? { ...token, raw: new Uint8Array(length) } : token,
    );
    assert.equal(retainedTextView({ ...paragraph, tokens }), null);
  }
  const reserved = paragraph.tokens.map((token, index) =>
    index === 1 ? { ...token, code: 25 } : token,
  );
  assert.equal(retainedTextView({ ...paragraph, tokens: reserved }), null);
  assert.deepEqual(paragraph, original);
});

test('actual hyphen fixture becomes an editable display candidate without losing native units', async () => {
  const input = readFileSync('reference/rhwp/samples/HWP5-nopassword-123456.hwp');
  const original = Buffer.from(input);
  const reader = await createHwp5Reader(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    const result = reader.readText(input);
    const paragraph = result.sections[0].paragraphs[5];
    const view = retainedTextView(paragraph);
    assert(view);
    assert.equal(view.text.charCodeAt(90), 0x00ad);
    assert.equal(view.text.charCodeAt(4), 0x00a0);
    assert.equal(view.text.length, paragraph.declaredUnits - 1);
    const displayed = displayContent(result).paragraphs.find(
      (row) => row.section === 0 && row.paragraph === 5,
    );
    assert.equal(displayed.editable, true);
    for (const unit of [0, 4, 5, 90, 91, view.text.length]) {
      assert.equal(sourceDisplayPosition(unit, displayed.sourceOffsets, view.text.length), unit);
      assert.equal(
        sourceTextChange({ startUnit: unit, endUnit: unit }, displayed.sourceOffsets).startUnit,
        unit,
      );
    }
    assert.deepEqual(input, original);
  } finally {
    reader.close();
  }
});
