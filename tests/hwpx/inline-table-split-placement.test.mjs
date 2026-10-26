import test from 'node:test';
import assert from 'node:assert/strict';
import { placeInlineTablePages } from '../../web/preview/inline-table-page-placement.mjs';

test('cell-split inline table aligns each fragment at its actual column without mutating source', () => {
  const table = { section: 0, tableNode: 2, pagination: { page_break: 'cell' } };
  const paragraph = {
    text: '\ufffc',
    paragraphShape: { alignment: 3, left: 0, right: 0, indent: 0 },
  };
  const boxes = [0, 1].map((pageOrdinal) => ({
    section: 0,
    tableNode: 2,
    listNode: 3 + pageOrdinal,
    pageOrdinal,
    x: 20,
    y: 40 + pageOrdinal * 500,
    width: 80,
    height: 60,
    referenceBoxes: {
      column: { x: 20 + pageOrdinal * 10, y: 20 + pageOrdinal * 500, width: 200, height: 300 },
    },
  }));
  const rows = boxes.map((box) => ({ ...box, x: box.x + 4 }));
  const flowPictures = boxes.map((box) => ({
    section: 0,
    pictureNode: 9,
    pageOrdinal: box.pageOrdinal,
    cell: { tableNode: 2, listNode: box.listNode },
    rectangle: { x: 30, y: box.y + 5, width: 10, height: 20 },
  }));
  const other = { section: 1, tableNode: 2, pageOrdinal: 0, x: 17, y: 20, width: 30, height: 40 };
  const layout = {
    state: 'placed',
    boxes: [...boxes, other],
    rows: [...rows, other],
    flowPictures,
  };
  const before = structuredClone(layout),
    result = placeInlineTablePages(table, paragraph, layout, 10);
  assert.equal(result.state, 'placed', result.error);
  assert.deepEqual(
    result.boxes.slice(0, 2).map((box) => box.x),
    [80, 90],
  );
  assert.deepEqual(
    result.rows.slice(0, 2).map((row) => row.x),
    [84, 94],
  );
  assert.deepEqual(
    result.flowPictures.map((p) => p.rectangle.x),
    [90, 100],
  );
  assert.deepEqual(
    result.flowPictures.map((p) => p.rectangle.y),
    [45, 545],
  );
  assert.equal(result.rows[2], other);
  assert.deepEqual(layout, before);
  const samePage = {
    ...layout,
    boxes: layout.boxes.map((box) =>
      box === other ? box : { ...box, columnOrdinal: box.pageOrdinal, pageOrdinal: 0 },
    ),
    rows: layout.rows.map((row) =>
      row === other ? row : { ...row, columnOrdinal: row.pageOrdinal, pageOrdinal: 0 },
    ),
    flowPictures: layout.flowPictures.map((p) => ({
      ...p,
      columnOrdinal: p.pageOrdinal,
      pageOrdinal: 0,
    })),
  };
  const columns = placeInlineTablePages(table, paragraph, samePage, 10);
  assert.equal(columns.state, 'placed', columns.error);
  assert.deepEqual(
    columns.boxes.slice(0, 2).map((box) => box.x),
    [80, 90],
  );
  assert.deepEqual(
    columns.flowPictures.map((p) => p.rectangle.x),
    [90, 100],
  );
  assert.equal(
    placeInlineTablePages({ ...table, pagination: { page_break: 'none' } }, paragraph, layout, 10)
      .error,
    'UnsupportedSplitInlineTable',
  );
  assert.equal(
    placeInlineTablePages(
      table,
      paragraph,
      { ...layout, rows: [{ ...rows[0], pageOrdinal: undefined }] },
      10,
    ).error,
    'UnsupportedSplitInlineTable',
  );
  const foreignNested = {
    section: 0,
    tableNode: 99,
    positionOwnerTableNode: 2,
    pageOrdinal: 9,
    x: 1,
    width: 2,
  };
  assert.equal(
    placeInlineTablePages(
      table,
      paragraph,
      { ...layout, boxes: [...layout.boxes, foreignNested] },
      10,
    ).error,
    'UnsupportedSplitInlineTable',
  );
  for (const pageOrdinal of [-1, NaN, 0.5]) {
    const invalid = {
      ...layout,
      boxes: layout.boxes.map((box, index) => (index === 1 ? { ...box, pageOrdinal } : box)),
    };
    assert.equal(
      placeInlineTablePages(table, paragraph, invalid, 10).error,
      'UnsupportedSplitInlineTable',
    );
  }
  for (const columnOrdinal of [-1, NaN, 0.5]) {
    const invalid = {
      ...layout,
      boxes: layout.boxes.map((box, index) => (index === 1 ? { ...box, columnOrdinal } : box)),
    };
    assert.equal(
      placeInlineTablePages(table, paragraph, invalid, 10).error,
      'UnsupportedSplitInlineTable',
    );
  }
  const orphanPicture = { ...flowPictures[0], pageOrdinal: 9 };
  assert.equal(
    placeInlineTablePages(
      table,
      paragraph,
      { ...layout, flowPictures: [...flowPictures, orphanPicture] },
      10,
    ).error,
    'UnsupportedSplitInlineTable',
  );
});
