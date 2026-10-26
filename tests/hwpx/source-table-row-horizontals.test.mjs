import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceTableRowHorizontals } from '../../web/preview/source-table-row-horizontals.mjs';
import { sourceTableColumns } from '../../web/preview/table-source-columns.mjs';
import { existsSync } from 'node:fs';
import { sourceRowTableOracle } from './source-row-table-oracle.mjs';
import { tableGrid } from '../../web/preview/table-grid.mjs';
import { tableSourceHorizontalLayout } from '../../web/preview/table-source-horizontal-layout.mjs';
import { measureTableCells } from '../../web/preview/table-cell-measurement.mjs';

const cell = (listNode, row, column, width, rowSpan = 1, columnSpan = 1) => ({
  listNode,
  row,
  column,
  width,
  rowSpan,
  columnSpan,
});
const fixture = () => ({
  rows: 2,
  columns: 2,
  cells: [cell(1, 0, 0, 100), cell(2, 0, 1, 200), cell(3, 1, 0, 100), cell(4, 1, 1, 300)],
});

test('positive row-local cells survive nonpositive derived common columns without accepting malformed source widths', () => {
  for (const mergedWidth of [100, 150]) {
    const table = {
      rows: 2,
      columns: 3,
      cells: [
        cell(1, 0, 0, mergedWidth, 1, 2),
        cell(2, 0, 2, 100),
        cell(3, 1, 0, 150),
        cell(4, 1, 1, mergedWidth - 50, 1, 2),
      ],
    };
    const common = sourceTableColumns(table);
    assert.equal(common.error, 'InvalidSourceTableColumns');
    assert.equal(common.reason, 'NonPositiveSourceColumnSolution');
    const selected = tableSourceHorizontalLayout(table);
    assert.equal(selected.state, 'resolved', selected.error);
    assert.deepEqual(selected.gridOptions, { sourceRowHorizontals: true });
    const invalid = structuredClone(table);
    invalid.cells[0].width = -1;
    const rejected = tableSourceHorizontalLayout(invalid);
    assert.equal(rejected.error, 'InvalidSourceTableColumns');
    assert.equal(rejected.reason, undefined);
  }
});

test('row-local source boundaries preserve different cell widths without changing strict uniform columns', () => {
  const table = fixture(),
    before = structuredClone(table);
  assert.equal(sourceTableColumns(table).error, 'ConflictingSourceTableColumns');
  const result = sourceTableRowHorizontals(table);
  assert.equal(result.state, 'resolved', result.error);
  assert.deepEqual(result.rowWidths, [300, 400]);
  assert.deepEqual(result.cells, [
    { listNode: 1, x: 0, width: 100 },
    { listNode: 2, x: 100, width: 200 },
    { listNode: 3, x: 0, width: 100 },
    { listNode: 4, x: 100, width: 300 },
  ]);
  assert.equal(result.width, 400);
  assert.equal(result.columns, undefined);
  assert.deepEqual(table, before);
  assert.deepEqual(
    sourceTableRowHorizontals({ ...table, cells: table.cells.toReversed() }).cells.toReversed(),
    result.cells,
  );
});

test('merged rows use exact source widths and spanning cells must keep the same physical position', () => {
  const table = {
    rows: 2,
    columns: 3,
    cells: [
      cell(1, 0, 0, 100, 2),
      cell(2, 0, 1, 300, 1, 2),
      cell(3, 1, 1, 200),
      cell(4, 1, 2, 150),
    ],
  };
  const result = sourceTableRowHorizontals(table);
  assert.equal(result.state, 'resolved');
  assert.deepEqual(result.rowWidths, [400, 450]);
  assert.deepEqual(result.cells.at(-1), { listNode: 4, x: 300, width: 150 });
  const moved = {
    rows: 2,
    columns: 2,
    cells: [cell(1, 0, 0, 100), cell(2, 0, 1, 200, 2), cell(3, 1, 0, 150)],
  };
  assert.equal(sourceTableRowHorizontals(moved).error, 'ConflictingSourceSpanningCellPosition');
});

test('row-local grid and both cell measurement passes preserve the same physical source widths', () => {
  const table = { ...fixture(), section: 0, tableNode: 9 };
  table.cells = table.cells.map((cell, index) => ({ ...cell, height: 750, paragraphs: [index] }));
  const source = tableSourceHorizontalLayout(table);
  assert.equal(source.state, 'resolved', source.error);
  assert.deepEqual(source.gridOptions, { sourceRowHorizontals: true });
  const grid = tableGrid(table, { x: 30, ...source.gridOptions });
  assert.equal(grid.columns, null);
  assert.equal(grid.width, 400 / 75);
  assert.equal(grid.cells[1].width, 200 / 75);
  assert.equal(grid.cells[3].width, 300 / 75);
  assert.equal(grid.cells[1].x, grid.cells[3].x);
  assert.throws(() => tableGrid(table, { sourceRowHorizontals: true, columnWidths: [40, 40] }));
  const paragraphs = table.cells.map((cell, index) => ({
    section: 0,
    paragraph: index,
    text: 'a',
    editable: true,
    tableCell: { tableNode: 9, listNode: cell.listNode },
  }));
  const measured = measureTableCells(table, paragraphs, () => ({ width: 1, height: 20 }), {
    origin: { x: 0, y: 0 },
    padding: 0,
    ...source.gridOptions,
  });
  assert.equal(measured.state, 'measured', measured.error);
  for (const [index, cell] of table.cells.entries()) {
    assert.equal(measured.grid.cells[index].width, cell.width / 75);
    assert.equal(measured.flows.get(cell.listNode).rows[0].width, cell.width / 75);
  }
});

test('row-local boundaries reject missing overlap null dimensions identity collisions and excessive span work', () => {
  for (const mutate of [
    (t) => t.cells.pop(),
    (t) => t.cells.push({ ...t.cells[0], listNode: 5 }),
    (t) => (t.cells[0].width = null),
    (t) => (t.cells[0].width = 0),
    (t) => (t.cells[0].rowSpan = 3),
    (t) => (t.cells[0].columnSpan = 3),
    (t) => (t.cells[0].listNode = t.cells[1].listNode),
    (t) => delete t.cells[0],
  ]) {
    const table = fixture();
    mutate(table);
    assert.equal(sourceTableRowHorizontals(table).state, 'unavailable');
  }
  assert.equal(
    sourceTableRowHorizontals(fixture(), { maxCoveredCells: 3 }).error,
    'SourceTableRowHorizontalLimit',
  );
  assert.equal(
    sourceTableRowHorizontals({ ...fixture(), pagination: { cell_spacing: 1 } }).error,
    'UnsupportedSourceTableRowSpacing',
  );
});

test('actual reference row resizing preserves every independent XML cell width', (t) => {
  const path = 'reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx';
  if (!existsSync(path)) {
    t.skip('reference fixture unavailable');
    return;
  }
  const table = sourceRowTableOracle(path, '1295981299');
  assert.equal(sourceTableColumns(table).error, 'ConflictingSourceTableColumns');
  const result = sourceTableRowHorizontals(table);
  assert.equal(result.state, 'resolved', JSON.stringify(result));
  assert.equal(result.width, 48013);
  assert.equal(result.width, table.declaredWidth);
  assert.deepEqual(result.rowWidths, [...Array(19).fill(46598), 48013, 48013]);
  for (const [index, cell] of table.cells.entries())
    assert.equal(result.cells[index].width, cell.width);
  for (const [index, cell] of table.cells.entries())
    if (cell.column === 8) {
      assert.equal(result.cells[index].x, 41592);
      assert.equal(result.cells[index].width, cell.row >= 19 ? 6421 : 5006);
    }
});
