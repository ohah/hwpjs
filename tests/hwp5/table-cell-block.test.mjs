import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adjacentBlockCell,
  tableCellBlockContainsBox,
  tableCellBlockContext,
  tableCellBlockPaint,
} from '../../web/preview/table-cell-block.mjs';

const section = 0;
const tableNode = 7;
const row = (paragraph, listNode) => ({
  section,
  paragraph,
  selectable: true,
  tableCell: { tableNode, listNode },
});
const cell = (row, column, listNode, columnSpan = 1) => ({
  row,
  column,
  listNode,
  columnSpan,
  rowSpan: 1,
  paragraphs: [listNode + 10],
});
const cells = [cell(0, 0, 8), cell(0, 1, 9, 2), cell(1, 0, 10), cell(1, 1, 11), cell(1, 2, 12)];
const table = { section, tableNode, rows: 2, columns: 3, cells };

test('cell blocks resolve only the current supported source owner and complete table', () => {
  const point = { section, paragraph: 18, unit: 0 };
  for (const format of ['hwp5', 'hwpx']) {
    const content = { format, tables: [table] };
    const current = row(18, 8);
    assert.deepEqual(tableCellBlockContext(content, point, current), {
      table,
      cell: cells[0],
      created: false,
    });
    assert.equal(tableCellBlockContext(content, point, row(18, 9)), null);
    assert.equal(tableCellBlockContext(content, point, { ...current, clipped: true }), null);
    for (const extra of [
      { limited: true },
      { window: {} },
      { viewKind: 'partial' },
      { tables: [{ ...table, partial: true }] },
      { tables: [table, table] },
    ])
      assert.equal(tableCellBlockContext({ ...content, ...extra }, point, current), null);
  }
});

test('block arrows stop at grid edges, skip the current span, and extend over merged cells', () => {
  assert.equal(adjacentBlockCell(table, cells[0], 'ArrowLeft'), null);
  assert.equal(adjacentBlockCell(table, cells[0], 'ArrowRight'), cells[1]);
  assert.equal(adjacentBlockCell(table, cells[1], 'ArrowRight'), null);
  assert.equal(adjacentBlockCell(table, cells[1], 'ArrowDown'), cells[3]);
  assert.equal(adjacentBlockCell(table, cells[4], 'ArrowUp'), cells[1]);
  const paint = (stage) =>
    tableCellBlockPaint({ table, start: cells[0], cell: cells[3], stage, created: false });
  assert.deepEqual([...paint('cell').cells], [11]);
  assert.deepEqual([...paint('extend').cells], [8, 9, 10, 11, 12]);
  assert.deepEqual([...paint('table').cells], [8, 9, 10, 11, 12]);
  assert(tableCellBlockContainsBox(paint('cell'), { section, tableNode, listNode: 11 }));
  assert(!tableCellBlockContainsBox(paint('cell'), { section, tableNode: 1, listNode: 11 }));
  assert(
    !tableCellBlockContainsBox(paint('cell'), {
      section,
      tableNode,
      listNode: 11,
      previewOnly: true,
    }),
  );
});

test('generated cells retain identity and never alias a source cell or another table', () => {
  const identity = 'generated-1';
  const createdCell = { identity, row: 0, column: 0 };
  const entry = { row: 0, column: 0 };
  const generated = { identity, section, cells: [entry] };
  const point = { section, createdCell, unit: 0 };
  const context = tableCellBlockContext({ format: 'hwpx', createdTables: [generated] }, point, {
    section,
    createdCell,
    editable: true,
  });
  assert.deepEqual(context, { table: generated, cell: entry, created: true });
  const paint = tableCellBlockPaint({ ...context, start: entry, stage: 'cell' });
  assert(tableCellBlockContainsBox(paint, { section, createdCell }));
  assert(!tableCellBlockContainsBox(paint, { section, tableNode, listNode: 0 }));
  assert(
    !tableCellBlockContainsBox(paint, {
      section,
      createdCell: { ...createdCell, identity: 'another' },
    }),
  );
});
