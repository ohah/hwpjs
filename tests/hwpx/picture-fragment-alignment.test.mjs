import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePicturePageTextLine } from '../../web/preview/picture-page-text-line.mjs';
import { pictureParagraphFlow } from '../../web/preview/picture-paragraph-flow.mjs';
import { positionedRowFragments } from '../../web/preview/positioned-row-fragments.mjs';

const line = { x: 10, y: 0, width: 42, height: 28 };
const paragraph = (text) => ({ section: 0, paragraph: 0, text, paragraphShape: { alignment: 0 } });
const xs = (row) => row.boundaries.map((point) => point.x);

test('remeasured picture text uses shared justification instead of natural widths', () => {
  const p = paragraph('a b c d'),
    before = structuredClone(p);
  const result = measurePicturePageTextLine(p, 0, line, 0, [], () => 8);
  assert.equal(result.state, 'available');
  assert.equal(result.rows[0].text, 'a b c');
  assert.deepEqual(xs(result.rows[0]), [0, 8, 17, 25, 34, 42]);
  assert.deepEqual(p, before);
  const distributed = pictureParagraphFlow('가😀나', { ...line, width: 80 }, [], () => 8, {
    paragraphShape: { alignment: 4 },
  });
  assert.deepEqual(xs(distributed.rows[0]), [0, 36, 72, 80]);
});

test('a truncated source band is not mistaken for the final paragraph line', () => {
  const p = paragraph('a b');
  assert.deepEqual(
    xs(measurePicturePageTextLine(p, 0, line, 0, [], () => 8).rows[0]),
    [0, 8, 16, 24],
  );
  const continued = measurePicturePageTextLine(p, 0, line, 0, [], () => 8, { paragraphEndUnit: 7 });
  assert.deepEqual(xs(continued.rows[0]), [0, 8, 34, 42]);
  assert.equal(
    measurePicturePageTextLine(p, 0, line, 0, [], () => 8, { paragraphEndUnit: 2 }).error,
    'InvalidPicturePageTextLine',
  );
});

test('positioned fragments own their alignment diagnostic instead of copying the source carrier', () => {
  const p = paragraph('ab');
  const source = {
    kind: 'text',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 2,
    height: 20,
    paragraphSource: p,
    alignmentUnavailable: 'UnsupportedAlignmentControl',
  };
  const fragment = {
    kind: 'text',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 2,
    text: 'ab',
    width: 80,
    height: 20,
    textHeight: 20,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 8 },
      { unit: 2, x: 16 },
    ],
  };
  const current = { ...source, positionedFragments: [fragment] },
    before = structuredClone(current);
  const result = positionedRowFragments(source, current, 1);
  assert.equal(result.state, 'expanded');
  assert.equal(result.rows[0].alignmentUnavailable, undefined);
  assert.deepEqual(current, before);
  fragment.alignmentUnavailable = 'UnsupportedAlignmentControl';
  assert.equal(
    positionedRowFragments(source, current, 1).rows[0].alignmentUnavailable,
    'UnsupportedAlignmentControl',
  );
});

test('actual controls remain unsupported where spacing is required', () => {
  for (const text of ['a\tb', 'a\ufffcb']) {
    const p = { ...paragraph(text), paragraphShape: { alignment: 4 } };
    const result = measurePicturePageTextLine(p, 0, { ...line, width: 80 }, 0, [], () => 8);
    assert.equal(result.rows[0].alignmentUnavailable, 'UnsupportedAlignmentControl');
    assert.deepEqual(xs(result.rows[0]), [0, 8, 16, 24]);
  }
});

test('fragment width validation permits trailing blank overhang but never visible ink overflow', () => {
  const p = paragraph('ab ');
  const source = {
    kind: 'text',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 3,
    height: 20,
    paragraphSource: p,
  };
  const fragment = {
    ...source,
    text: p.text,
    textHeight: 20,
    width: 20,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 10 },
      { unit: 2, x: 20 },
      { unit: 3, x: 28 },
    ],
  };
  const carrier = { ...source, positionedFragments: [fragment] };
  assert.equal(positionedRowFragments(source, carrier, 1).state, 'expanded');
  fragment.boundaries[2].x = 21;
  assert.equal(positionedRowFragments(source, carrier, 1).error, 'InvalidPositionedRowFragments');
  fragment.boundaries[2].x = 20;
  fragment.boundaries[3].x = Infinity;
  assert.equal(positionedRowFragments(source, carrier, 1).error, 'InvalidPositionedRowFragments');
});
