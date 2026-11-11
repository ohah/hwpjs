import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedSourceTableCells } from '../../web/preview/source-table-rectangular-grid.mjs';
import { sourceTableCellWidthPlan } from '../../web/preview/source-table-cell-width.mjs';
import { sourceTableCellHeightPlan } from '../../web/preview/source-table-cell-height.mjs';

const fixture = (count) => ({
  section: 0,
  tableNode: 1,
  rows: count / 2,
  columns: 2,
  sourceGeometry: { in_margin: [0, 0, 0, 0] },
  cells: Array.from({ length: count }, (_, i) => ({
    listNode: i,
    row: i >> 1,
    column: i % 2,
    rowSpan: 1,
    columnSpan: 1,
    width: i % 2 ? 14000 : 6000,
    height: (i >> 1) % 2 ? 4500 : 1500,
    sourceMargin: { has_margin: false },
  })).reverse(),
});
test('unordered source cells yield the same row-major grid and reject duplicate addresses', () => {
  const table = fixture(4);
  assert.deepEqual(
    orderedSourceTableCells(table).map((c) => c.listNode),
    [0, 1, 2, 3],
  );
  assert.throws(() =>
    orderedSourceTableCells({
      ...table,
      cells: [table.cells[0], table.cells[0], ...table.cells.slice(2)],
    }),
  );
  assert.throws(() => orderedSourceTableCells({ ...table, cells: table.cells.slice(1) }));
  for (const edit of [{ row: -1 }, { column: 2 }, { rowSpan: 2 }, { columnSpan: 0 }]) {
    assert.throws(() =>
      orderedSourceTableCells({
        ...table,
        cells: [{ ...table.cells[0], ...edit }, ...table.cells.slice(1)],
      }),
    );
  }
});
test('width and height plans use linear source access and perform no row scans or sorting', () => {
  for (const count of [1024, 2048, 4096]) {
    const table = fixture(count),
      source = table.cells;
    const rectangle = {
      section: 0,
      tableNode: 1,
      expectedRows: table.rows,
      expectedColumns: 2,
      top: 0,
      left: 0,
      bottom: table.rows,
      right: 2,
    };
    let reads = 0;
    table.cells = new Proxy(source, {
      get(target, key, receiver) {
        if (key === 'filter' || key === 'sort') throw Error('RepeatedSourceScan');
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const sort = Array.prototype.sort;
    Array.prototype.sort = function () {
      throw Error('GridPlanSort');
    };
    try {
      const width = sourceTableCellWidthPlan(table, rectangle);
      assert.equal(width.length, count);
      assert(width.every((c) => c.width === 10000));
      assert(reads <= 3 * count);
      reads = 0;
      const height = sourceTableCellHeightPlan(table, {
        ...rectangle,
        minimums: source.map((c) => ({ listNode: c.listNode, height: 0 })),
      });
      assert.equal(height.length, count);
      assert(height.every((c) => c.height === 3000));
      assert(reads <= 4 * count, `${reads} source reads for ${count} cells`);
    } finally {
      Array.prototype.sort = sort;
    }
  }
});
