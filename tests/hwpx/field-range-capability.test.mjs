import test from 'node:test';
import assert from 'node:assert/strict';
import { hwpxFieldRangeTarget } from '../../web/preview/hwpx-field-range-target.mjs';

test('pending table field capability gates the same range target without inventing spans', () => {
  const target = { beginElement: 71, start: 12, end: 40 };
  const calls = [];
  const editor = {
    createdTableFieldLabelMode(section) {
      calls.push(['mode', section]);
      return false;
    },
    fieldRangeTarget(...range) {
      calls.push(['target', ...range]);
      return target;
    },
  };
  assert.equal(hwpxFieldRangeTarget(editor, true, 2, 3, 13, 13), null);
  assert.deepEqual(calls, [['mode', 2]]);
  calls.length = 0;
  assert.equal(hwpxFieldRangeTarget(editor, false, 2, 3, 13, 13), target);
  assert.deepEqual(calls, [['target', 2, 3, 13, 13]]);
  calls.length = 0;
  editor.createdTableFieldLabelMode = (section) => {
    calls.push(['mode', section]);
    return true;
  };
  assert.equal(hwpxFieldRangeTarget(editor, true, 2, 3, 13, 13), target);
  assert.deepEqual(calls, [
    ['mode', 2],
    ['target', 2, 3, 13, 13],
  ]);
  editor.createdTableFieldLabelMode = () => {
    throw new Error('InvalidCreatedTableHostMode');
  };
  assert.throws(
    () => hwpxFieldRangeTarget(editor, true, 2, 3, 13, 13),
    /InvalidCreatedTableHostMode/,
  );
  editor.fieldRangeTarget = () => null;
  assert.equal(hwpxFieldRangeTarget(editor, false, 2, 3, 13, 13), null);
});
