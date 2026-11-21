import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutCreatedTable } from '../../web/preview/created-table-layout.mjs';
const table = {
  section: 0,
  identity: '9007199254740993',
  rows: 1,
  columns: 2,
  resources: { character: 7 },
  cells: [
    { row: 0, column: 0, width: 7200, height: 1000, text: '가😀' },
    { row: 0, column: 1, width: 7200, height: 1000, text: '' },
  ],
};
const measure = (text) => ({ width: [...text].length * 8, height: 16 });
test('created table local flow uses shared units and explicit identity cell ownership', () => {
  const before = structuredClone(table);
  const result = layoutCreatedTable(table, measure, { x: 30, y: 40 });
  assert.equal(result.width, 192);
  assert.equal(result.boxes.length, 2);
  assert.equal(result.boxes[1].x, 126);
  assert.equal(result.boxes[1].createdCell.column, 1);
  assert.equal(result.rows[0].createdCell.identity, table.identity);
  assert.deepEqual(
    result.rows[0].boundaries.map((b) => b.unit),
    [0, 1, 3],
  );
  assert.equal(result.rows[0].tableNode, undefined);
  assert.equal(result.paragraphs[0].paragraph, undefined);
  assert.equal(result.paragraphs[0].characterRanges[0].charShapeId, 7);
  assert.deepEqual(table, before);
});
test('created table local flow refuses row truncation', () => {
  assert.equal(layoutCreatedTable(table, measure, { maxRows: 2 }).rows.length, 2);
  assert.throws(
    () => layoutCreatedTable(table, measure, { maxRows: 1 }),
    /CreatedTableLayoutRowBudgetExceeded/,
  );
  assert.throws(
    () => layoutCreatedTable({ ...table, identity: 1 }, measure),
    /InvalidCreatedTableLayout/,
  );
});

for (const displayFormat of ['hwp5', 'hwpx']) {
  test(`${displayFormat} final generated cell box aligns text and caret rows without moving the grid`, () => {
    const nativeTable = {
      ...table,
      displayFormat,
      displayInsets: { left: 3, right: 3, top: 6, bottom: 9 },
      createdCellPropertiesVersion: 1,
      width: 14400,
      height: 7200,
      cells: table.cells.map((cell, index) => ({
        ...cell,
        x: index * 7200,
        y: 0,
        height: 7200,
      })),
    };
    const view = (verticalAlignment) =>
      layoutCreatedTable(
        {
          ...nativeTable,
          cells: [{ ...nativeTable.cells[0], verticalAlignment }, nativeTable.cells[1]],
        },
        measure,
      );
    const inherited = layoutCreatedTable(nativeTable, measure);
    const top = view(0);
    const center = view(1);
    const bottom = view(2);
    assert.deepEqual(top, inherited);
    assert.deepEqual(view(null), inherited);
    assert.deepEqual(bottom.boxes, top.boxes);
    assert.deepEqual(center.boxes, top.boxes);
    assert.equal(bottom.height, top.height);
    assert.equal(center.height, top.height);
    const first = (layout) => layout.rows.find((row) => row.createdCell.column === 0);
    const topRow = first(top);
    const centerRow = first(center);
    const bottomRow = first(bottom);
    assert(bottomRow.y > centerRow.y && centerRow.y > topRow.y);
    assert(Math.abs(bottomRow.y - topRow.y - 2 * (centerRow.y - topRow.y)) < 1e-8);
    assert.deepEqual(bottomRow.boundaries, topRow.boundaries);
    assert.deepEqual(bottomRow.pageClip, topRow.pageClip);
    assert.deepEqual(
      bottom.rows.filter((row) => row.createdCell.column === 1),
      top.rows.filter((row) => row.createdCell.column === 1),
    );
    assert.throws(() => view(3), /UnsupportedCellVerticalAlignment/);
  });
}
