import test from 'node:test';
import assert from 'node:assert/strict';
import { nestedTablePaperBounds } from '../../web/preview/nested-table-paper-bounds.mjs';

test('final nested bounds allow cell overflow but never paper overflow or absent references', () => {
  const box = {
    tableNode: 2,
    listNode: 12,
    depth: 1,
    x: 90,
    y: 20,
    width: 110,
    height: 20,
    referenceBoxes: { paper: { x: 10, y: 10, width: 190, height: 190 } },
  };
  const before = structuredClone(box);
  assert.equal(nestedTablePaperBounds([box]).state, 'contained');
  for (const patch of [{ x: 9 }, { y: 9 }, { width: 111 }, { height: 181 }]) {
    const result = nestedTablePaperBounds([{ ...box, ...patch }]);
    assert.equal(result.error, 'NestedTablePaperOverflow');
    assert.equal(result.tableNode, 2);
  }
  for (const patch of [{ referenceBoxes: {} }, { width: NaN }, { height: 0 }])
    assert.equal(
      nestedTablePaperBounds([{ ...box, ...patch }]).error,
      'InvalidNestedTablePaperBounds',
    );
  assert.deepEqual(box, before);
});

test('invalid depth cannot bypass a final paper bound check', () => {
  const box = {
    tableNode: 2,
    listNode: 12,
    depth: 1,
    x: 10000,
    y: 0,
    width: 10,
    height: 10,
    referenceBoxes: { paper: { x: 0, y: 0, width: 200, height: 200 } },
  };
  assert.equal(nestedTablePaperBounds([box]).error, 'NestedTablePaperOverflow');
  for (const depth of [-1, NaN, Infinity, '0', '1', null, false, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(
      nestedTablePaperBounds([{ ...box, depth }]).error,
      'InvalidNestedTablePaperBounds',
    );
  for (const entry of [null, undefined, [], 'box', 1])
    assert.equal(nestedTablePaperBounds([entry]).error, 'InvalidNestedTablePaperBounds');
  assert.equal(
    nestedTablePaperBounds([{ depth: 0 }]).state,
    'contained',
    "root bounds remain the root placement owner's responsibility",
  );
  assert.equal(
    nestedTablePaperBounds([{}]).state,
    'contained',
    'absent depth is existing root metadata',
  );
});
