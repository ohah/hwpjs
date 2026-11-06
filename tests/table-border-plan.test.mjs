import test from 'node:test';
import assert from 'node:assert/strict';
import { tableBorderPlan } from '../js/table-border-plan.mjs';
const cell = (listNode, row, column, rowSpan = 1, columnSpan = 1) => ({
  listNode,
  row,
  column,
  rowSpan,
  columnSpan,
});
const table = (cells) => ({ section: 0, tableNode: 10, partial: false, cells });
const request = {
  section: 0,
  tableNode: 10,
  listNode: 20,
  mode: 'table',
  region: 'outer',
  style: 'SOLID',
  width: 20,
  color: 0,
};
test('table outer and inner border masks agree on both sides of shared cell boundaries', () => {
  const grid = table([cell(23, 1, 1), cell(20, 0, 0), cell(22, 1, 0), cell(21, 0, 1)]);
  const outer = tableBorderPlan(grid, request);
  assert.equal(outer.state, 'planned');
  assert.deepEqual(Object.fromEntries(outer.cells.map((c) => [c.listNode, c.edges])), {
    20: 5,
    21: 6,
    22: 9,
    23: 10,
  });
  const inner = tableBorderPlan(grid, { ...request, region: 'inner' });
  assert.deepEqual(Object.fromEntries(inner.cells.map((c) => [c.listNode, c.edges])), {
    20: 10,
    21: 9,
    22: 6,
    23: 5,
  });
  const all = tableBorderPlan(grid, { ...request, region: 'all' });
  assert.ok(all.cells.every((c) => c.edges === 15 && c.color === 0));
  assert.ok(Object.isFrozen(all.cells) && all.cells.every(Object.isFrozen));
});
test('merged edge cancels against multiple short neighbours without splitting a resource edge', () => {
  const grid = table([cell(20, 0, 0, 2), cell(21, 0, 1), cell(22, 1, 1)]);
  assert.equal(tableBorderPlan(grid, request).state, 'planned');
  const inner = tableBorderPlan(grid, { ...request, region: 'inner' });
  assert.deepEqual(Object.fromEntries(inner.cells.map((c) => [c.listNode, c.edges])), {
    20: 2,
    21: 9,
    22: 5,
  });
  assert.equal(
    tableBorderPlan(grid, {
      ...request,
      mode: 'range',
      range: { rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 2 },
    }).error,
    'MergedCellBoundaryUnsupported',
  );
});
test('rectangular range edits only fully contained original cells and cell mode stays local', () => {
  const grid = table([cell(20, 0, 0), cell(21, 0, 1), cell(22, 1, 0), cell(23, 1, 1)]);
  const result = tableBorderPlan(grid, {
    ...request,
    mode: 'range',
    range: { rowStart: 1, rowEnd: 2, columnStart: 0, columnEnd: 2 },
  });
  assert.deepEqual(
    result.cells.map((c) => c.listNode),
    [22, 23],
  );
  assert.deepEqual(
    result.cells.map((c) => c.edges),
    [13, 14],
  );
  assert.deepEqual(
    tableBorderPlan(grid, { ...request, mode: 'cell' }).cells.map((c) => c.listNode),
    [20],
  );
  assert.deepEqual(tableBorderPlan(grid, { ...request, mode: 'cell', region: 'inner' }).cells, []);
});
test('endpoint proof refuses equal-area overlap plus hole, duplicate owners and incomplete observations', () => {
  const bad = table([cell(20, 0, 0, 2), cell(21, 0, 1), cell(22, 1, 0)]);
  assert.equal(tableBorderPlan(bad, request).error, 'UnsupportedTableCoverage');
  for (const grid of [
    table([cell(20, 0, 0), cell(20, 0, 1)]),
    { ...table([cell(20, 0, 0)]), partial: true },
    { ...table([cell(20, 0, 0)]), partial: undefined },
    table([{ ...cell(20, 0, 0), rowSpan: undefined }]),
  ])
    assert.equal(tableBorderPlan(grid, request).state, 'unavailable');
});
test('huge merged spans need only boundary work and protected non-target cells remain untouched', () => {
  const huge = table([cell(20, 0, 0, 65535, 65535)]);
  assert.equal(tableBorderPlan(huge, request).cells[0].edges, 15);
  const grid = table([cell(20, 0, 0), { ...cell(21, 0, 1), protected: true }]);
  assert.equal(tableBorderPlan(grid, { ...request, mode: 'cell' }).state, 'planned');
  assert.equal(tableBorderPlan(grid, request).error, 'ProtectedCell');
});
