import test from 'node:test';
import assert from 'node:assert/strict';
import { placeFootnoteArea } from '../../web/preview/footnote-area-placement.mjs';

const policy = {
  state: 'selected',
  section: 0,
  kind: 'footnote',
  aboveLine: 2,
  belowLine: 3,
  betweenNotes: 4,
  beneathText: false,
};
const column = { x: 10, y: 20, width: 100, height: 200 };
function note() {
  return {
    section: 0,
    noteNode: 1,
    kind: 'footnote',
    width: 100,
    height: 30,
    rows: [
      {
        kind: 'text',
        x: 11,
        y: 6,
        height: 16,
        createdCell: { identity: '1', row: 0, column: 0 },
        pageClip: { x: 5, y: 0, width: 50, height: 30 },
      },
    ],
    boxes: [
      { x: 5, y: 0, width: 50, height: 30, createdCell: { identity: '1', row: 0, column: 0 } },
    ],
    numberPrefixes: [
      { x: 0, y: 0, height: 20, numberPrefix: { text: '1)', width: 8, height: 16 } },
    ],
  };
}

test('footnote area translates generated boxes clips and prefixes once without mutation', () => {
  const input = note(),
    before = structuredClone(input);
  const result = placeFootnoteArea([input], policy, column, 40, 1, 2);
  assert.equal(result.state, 'placed', result.error);
  assert.equal(result.boxes.length, 1);
  assert.equal(result.numberPrefixes.length, 1);
  assert.equal(result.rows[0].pageClip.x, result.boxes[0].x);
  assert.equal(result.rows[0].pageClip.y, result.boxes[0].y);
  assert.equal(result.rows[0].x - result.boxes[0].x, 6);
  assert.equal(result.rows[0].y - result.boxes[0].y, 6);
  assert.equal(result.numberPrefixes[0].y, result.boxes[0].y);
  assert.deepEqual(input, before);
});

test('footnote projection budgets include earlier prefixes and reject invalid boxes', () => {
  const second = {
    ...note(),
    noteNode: 2,
    numberPrefixes: [],
    boxes: [],
    rows: [
      { x: 0, y: 0, height: 10 },
      { x: 0, y: 10, height: 10 },
    ],
  };
  assert.equal(
    placeFootnoteArea([note(), second], policy, column, 40, 1, 3).error,
    'FootnoteAreaLimit',
  );
  const wide = note();
  wide.boxes[0].width = 101;
  assert.equal(placeFootnoteArea([wide], policy, column, 40, 1).error, 'InvalidFootnoteArea');
  const missing = note();
  delete missing.boxes[0].width;
  assert.equal(placeFootnoteArea([missing], policy, column, 40, 1).error, 'InvalidFootnoteArea');
});
