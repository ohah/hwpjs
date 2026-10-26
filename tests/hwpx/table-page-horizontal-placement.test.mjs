import test from 'node:test';
import assert from 'node:assert/strict';
import { placeTablePagesHorizontally } from '../../web/preview/table-page-horizontal-placement.mjs';
import { placeFloatingTable } from '../../web/preview/table-placement.mjs';

test('paragraph-relative measured width and outer margins expose sample right overflow', () => {
  const column = {
    x: 133.38666666666666,
    y: 152.26666666666668,
    width: 566.9333333333334,
    height: 876.8533333333334,
  };
  const paper = { x: 20, y: 20, width: 793.7066666666667, height: 1122.5066666666667 };
  const table = {
    tableNode: 153,
    sourceGeometry: {
      geometry: {
        width: 40454,
        height: 2564,
        width_relative: 4,
        height_relative: 2,
        treat_as_character: false,
        horizontal_offset: 0,
        vertical_offset: 0,
      },
      vertical_relative: 2,
      horizontal_relative: 3,
      vertical_alignment: 0,
      horizontal_alignment: 0,
    },
  };
  const margins = { left: 283 / 75, right: 850 / 75, top: 567 / 75, bottom: 1134 / 75 };
  const layout = {
    state: 'placed',
    rows: [],
    boxes: [
      {
        tableNode: 153,
        pageOrdinal: 0,
        x: column.x + margins.left,
        y: column.y,
        width: 40454 / 75,
        height: 2564 / 75,
        referenceBoxes: { column, page: column, paper },
      },
    ],
  };
  const paragraph = { paragraphShape: { alignment: 0, left: 3000, right: 0, indent: 0 } };
  const before = structuredClone({ layout, table, margins, paragraph });
  const placed = placeTablePagesHorizontally(table, layout, margins, paragraph);
  assert.equal(placed.state, 'placed', placed.error);
  assert.equal(placed.boxes[0].x, column.x + 20);
  const right = column.x + 3000 / 150 + margins.left + 40454 / 75 + margins.right;
  assert.ok(Math.abs(right - (column.x + column.width) - 7.56) < 1e-8);
  assert.ok(right < paper.x + paper.width);
  const sourcePlacement = placeFloatingTable(table, {
    paper,
    page: column,
    column,
    paragraph: { ...column, x: column.x + 20, width: column.width - 20 },
  });
  assert.equal(sourcePlacement.state, 'placed');
  assert.equal(sourcePlacement.rectangle.x, column.x + 20);
  assert.ok(
    sourcePlacement.rectangle.x + sourcePlacement.rectangle.width < column.x + column.width,
  );
  assert.ok(
    Math.abs(
      sourcePlacement.rectangle.x +
        sourcePlacement.rectangle.width +
        margins.right -
        (column.x + column.width) -
        3.7866666666666666,
    ) < 1e-8,
  );
  const widerThanBody = { ...layout, boxes: [{ ...layout.boxes[0], width: column.width }] };
  assert.equal(
    placeTablePagesHorizontally(table, widerThanBody, margins, paragraph).state,
    'placed',
  );
  const oversized = { ...layout, boxes: [{ ...layout.boxes[0], width: paper.width }] };
  assert.equal(
    placeTablePagesHorizontally(table, oversized, margins, paragraph).error,
    'TablePageWidthOverflow',
  );
  const narrowPaper = {
    ...layout,
    boxes: [
      {
        ...layout.boxes[0],
        referenceBoxes: {
          column,
          page: column,
          paper: { ...paper, width: column.x + column.width - paper.x },
        },
      },
    ],
  };
  assert.equal(
    placeTablePagesHorizontally(table, narrowPaper, margins, paragraph).error,
    'TablePageWidthOverflow',
  );
  const invalidPaper = {
    ...layout,
    boxes: [
      {
        ...layout.boxes[0],
        referenceBoxes: { column, page: column, paper: { ...paper, width: Infinity } },
      },
    ],
  };
  assert.equal(
    placeTablePagesHorizontally(table, invalidPaper, margins, paragraph).error,
    'TablePageWidthOverflow',
  );
  assert.deepEqual({ layout, table, margins, paragraph }, before);
});

test('paragraph-relative floating tables use current margins and preserve other table coordinates', () => {
  const table = {
    tableNode: 2,
    sourceGeometry: {
      geometry: {
        width: 6000,
        height: 3000,
        width_relative: 4,
        height_relative: 2,
        treat_as_character: false,
        horizontal_offset: 750,
        vertical_offset: 0,
      },
      vertical_relative: 2,
      horizontal_relative: 3,
      vertical_alignment: 0,
      horizontal_alignment: 0,
    },
  };
  const column = { x: 20, y: 20, width: 200, height: 300 };
  const referenceBoxes = { column, page: column, paper: column };
  const layout = {
    state: 'placed',
    boxes: [
      { tableNode: 2, pageOrdinal: 0, x: 25, y: 40, width: 80, height: 40, referenceBoxes },
      { tableNode: 3, pageOrdinal: 0, x: 120, y: 100, width: 80, height: 40, referenceBoxes },
    ],
    rows: [
      { tableNode: 2, pageOrdinal: 0, x: 29, y: 44 },
      { tableNode: 3, pageOrdinal: 0, x: 124, y: 104 },
    ],
  };
  const paragraph = { paragraphShape: { alignment: 3, left: 750, right: 1500, indent: 750 } };
  const before = structuredClone(layout);
  const result = placeTablePagesHorizontally(table, layout, 5, paragraph);
  assert.equal(result.state, 'placed', result.error);
  assert.equal(result.boxes[0].x, 40);
  assert.equal(result.rows[0].x, 44);
  assert.deepEqual(result.boxes[1], layout.boxes[1]);
  assert.deepEqual(result.rows[1], layout.rows[1]);
  assert.deepEqual(layout, before);
  const picture = {
    section: 0,
    cell: { tableNode: 2, listNode: 4 },
    pageOrdinal: 0,
    rectangle: { x: 30, y: 45, width: 10, height: 20 },
  };
  const other = { ...picture, cell: { tableNode: 3, listNode: 5 } };
  const pictures = placeTablePagesHorizontally(
    { ...table, section: 0 },
    { ...layout, flowPictures: [picture, other] },
    5,
    paragraph,
  );
  assert.equal(pictures.state, 'placed', pictures.error);
  assert.equal(pictures.flowPictures[0].rectangle.x, 45);
  assert.deepEqual(pictures.flowPictures[1], other);
  assert.equal(picture.rectangle.x, 30);
  assert.equal(
    placeTablePagesHorizontally(
      { ...table, section: 0 },
      { ...layout, flowPictures: [{ ...picture, pageOrdinal: 99 }] },
      5,
      paragraph,
    ).error,
    'UnsupportedTablePageAnchor',
  );
  assert.equal(placeTablePagesHorizontally(table, layout, 5).error, 'UnsupportedTablePageAnchor');
  const changed = structuredClone(table);
  changed.sourceGeometry.horizontal_alignment = 2;
  assert.equal(placeTablePagesHorizontally(changed, layout, 5, paragraph).boxes[0].x, 120);
});

test('outer margins may extend into paper without allowing arbitrary offsets or oversized grids', () => {
  const column = { x: 20, y: 20, width: 100, height: 200 },
    paper = { x: 0, y: 0, width: 150, height: 250 };
  const table = {
    tableNode: 2,
    sourceGeometry: {
      geometry: {
        width: 6750,
        height: 3000,
        width_relative: 4,
        height_relative: 2,
        treat_as_character: false,
        horizontal_offset: 0,
        vertical_offset: 0,
      },
      vertical_relative: 2,
      horizontal_relative: 2,
      vertical_alignment: 0,
      horizontal_alignment: 0,
    },
  };
  const layout = {
    state: 'placed',
    rows: [],
    boxes: [
      {
        tableNode: 2,
        pageOrdinal: 0,
        x: 30,
        y: 30,
        width: 90,
        height: 40,
        referenceBoxes: { column, paper, page: column },
      },
    ],
  };
  const before = structuredClone(layout);
  const result = placeTablePagesHorizontally(table, layout, 10);
  assert.equal(result.state, 'placed');
  assert.equal(result.boxes[0].x, 30);
  assert.equal(result.boxes[0].horizontalOverflowBoundary, 'paper');
  assert.deepEqual(layout, before);
  assert.equal(placeTablePagesHorizontally(table, layout, 40).error, 'TablePageWidthOverflow');
  const offset = structuredClone(table);
  offset.sourceGeometry.geometry.horizontal_offset = 75;
  assert.equal(placeTablePagesHorizontally(offset, layout, 10).error, 'TablePageWidthOverflow');
  const oversized = { ...layout, boxes: [{ ...layout.boxes[0], width: 101 }] };
  assert.equal(placeTablePagesHorizontally(table, oversized, 10).error, 'TablePageWidthOverflow');
});
