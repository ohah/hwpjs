import test from 'node:test';
import assert from 'node:assert/strict';
import { placeInlineTablePages } from '../../web/preview/inline-table-page-placement.mjs';

test('isolated inline table follows paragraph alignment and refuses split or width overflow', () => {
  const table = { section: 0, tableNode: 2 };
  const referenceBoxes = { column: { x: 20, y: 20, width: 200, height: 300 } };
  const layout = {
    state: 'placed',
    boxes: [
      {
        section: 0,
        tableNode: 2,
        pageOrdinal: 0,
        x: 20,
        y: 40,
        width: 80,
        height: 60,
        referenceBoxes,
      },
    ],
    rows: [{ section: 0, tableNode: 2, x: 24, y: 44 }],
  };
  const paragraph = {
    text: '\ufffc',
    paragraphShape: { alignment: 3, left: 0, right: 0, indent: 0 },
  };
  const before = structuredClone(layout);
  const result = placeInlineTablePages(table, paragraph, layout, 10);
  assert.equal(result.state, 'placed');
  assert.equal(result.boxes[0].x, 80);
  assert.equal(result.rows[0].x, 84);
  assert.deepEqual(layout, before);
  const picture = {
    section: 0,
    pictureNode: 9,
    cell: { tableNode: 2, listNode: 3 },
    rectangle: { x: 30, y: 45, width: 10, height: 20 },
  };
  const withPicture = placeInlineTablePages(
    table,
    paragraph,
    { ...layout, flowPictures: [picture] },
    10,
  );
  assert.equal(withPicture.state, 'placed', withPicture.error);
  assert.equal(
    withPicture.flowPictures[0].rectangle.x,
    picture.rectangle.x + withPicture.boxes[0].x - layout.boxes[0].x,
  );
  assert.equal(withPicture.flowPictures[0].rectangle.y, picture.rectangle.y);
  assert.equal(picture.rectangle.x, 30);
  assert.equal(
    placeInlineTablePages(table, { ...paragraph, text: 'x\ufffc' }, layout, 10).error,
    'UnsupportedInlineTableHost',
  );
  assert.equal(
    placeInlineTablePages(
      table,
      paragraph,
      { ...layout, boxes: [...layout.boxes, { ...layout.boxes[0], pageOrdinal: 1 }] },
      10,
    ).error,
    'UnsupportedSplitInlineTable',
  );
  assert.equal(
    placeInlineTablePages(table, paragraph, layout, 100).error,
    'InlineTablePageWidthOverflow',
  );
  const wide = {
    ...layout,
    boxes: [
      {
        ...layout.boxes[0],
        width: 201,
        referenceBoxes: { ...referenceBoxes, paper: { x: 0, y: 0, width: 260, height: 400 } },
      },
    ],
  };
  assert.equal(placeInlineTablePages(table, paragraph, wide, 0).state, 'placed');
  assert.equal(
    placeInlineTablePages(
      table,
      paragraph,
      { ...wide, boxes: [{ ...wide.boxes[0], width: 300 }] },
      0,
    ).error,
    'InlineTablePageWidthOverflow',
  );
});
