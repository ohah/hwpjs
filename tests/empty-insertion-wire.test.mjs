import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCharacterRanges } from '../js/character-shapes-wire.mjs';
import { projectHwp5Ranges } from '../web/preview/hwp5-style-content.mjs';
import { characterRangeValues } from '../web/preview/character-range-values.mjs';
const wire = (flags, end = 0) => {
  const b = new Uint8Array(24),
    v = new DataView(b.buffer);
  b.set(new TextEncoder().encode('HCR1'));
  [1, 0, end, 1, flags].forEach((n, i) => v.setUint32(4 + i * 4, n, true));
  return b;
};
test('optional HCR1 insertion bit preserves 0 units and old rows, rejects malformed proof', () => {
  assert.deepEqual(decodeCharacterRanges(wire(1)), [{ start: 0, end: 0, charShapeId: 1 }]);
  const rows = decodeCharacterRanges(wire(3));
  assert.equal(rows[0].insertion, true);
  const source = { tokens: [], text: '', declaredUnits: 1, textPresent: false };
  const projected = projectHwp5Ranges(rows, source, '');
  assert.deepEqual(projected, [{ start: 0, end: 0, charShapeId: 1, insertion: true }]);
  assert.equal(
    characterRangeValues(
      { paragraphs: [{ section: 0, paragraph: 0, text: '', characterRanges: projected }] },
      [{ section: 0, paragraph: 0, startUnit: 0, endUnit: 0 }],
      (id) => id,
    ),
    null,
  );
  for (const [f, e] of [
    [2, 0],
    [4, 0],
    [3, 2],
  ])
    assert.throws(() => decodeCharacterRanges(wire(f, e)), /InvalidCharacterRanges/);
});
import {
  rangeFormattingObservation,
  insertionFormattingObservation,
} from '../web/preview/range-formatting-observation.mjs';
import { FONT_LANGUAGES } from '../js/font-face-identity.mjs';
test('shared resource resolver retains normal-range mixed and per-language observations', () => {
  const p = {
    section: 0,
    paragraph: 0,
    text: 'AB',
    characterRanges: [
      { start: 0, end: 1, charShapeId: 0 },
      { start: 1, end: 2, charShapeId: 1 },
    ],
  };
  const content = {
    format: 'hwp5',
    paragraphs: [p],
    characterPropertiesAvailable: true,
    characterFontNameAvailable: true,
    characterShapes: [
      { id: 0, height: 1000, bold: false, italic: false },
      { id: 1, height: 1200, bold: true, italic: false },
    ],
    characterFontReferences: [
      { id: 0, fontIds: [0, 0, 0, 0, 0, 0, 0] },
      { id: 1, fontIds: [1, 0, 0, 0, 0, 0, 0] },
    ],
    fontFaces: FONT_LANGUAGES.flatMap((language) => [
      { language, id: 0, name: 'face-' + language },
      ...(language === 'hangul' ? [{ language, id: 1, name: '다른 한글' }] : []),
    ]),
  };
  const read = (startUnit, endUnit) =>
    rangeFormattingObservation(content, [{ section: 0, paragraph: 0, startUnit, endUnit }]);
  assert.equal(read(0, 1).size, 1000);
  assert.equal(read(0, 2).size, 'mixed');
  assert.equal(read(0, 2).bold, 'mixed');
  assert.deepEqual(read(0, 2).fontNames.hangul, { kind: 'mixed' });
  assert.deepEqual(read(0, 2).fontNames.latin, { kind: 'single', name: 'face-latin' });
  assert.equal(
    insertionFormattingObservation(
      { ...content, format: 'hwpx' },
      { text: '', characterRanges: [{ start: 0, end: 0, charShapeId: 0, insertion: true }] },
      0,
    ),
    null,
  );
});
