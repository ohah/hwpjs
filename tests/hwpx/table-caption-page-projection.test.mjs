import test from "node:test";
import assert from "node:assert/strict";
import { reserveTableCaptionSpace } from "../../web/preview/table-caption-page-reservation.mjs";
import { projectTablePageCaption } from "../../web/preview/table-caption-page-projection.mjs";
import { tableCollisionFootprints } from "../../web/preview/table-collision-footprints.mjs";

test("caption page projection preserves paragraph identity and rejects split overflow and budget", () => {
  const table = {
    section: 0,
    tableNode: 2,
    cells: [{ listNode: 10 }],
    captionParagraphs: [5],
    sourceCaption: {
      caption_node: 3,
      list_node: 4,
      side: 3,
      full_size: false,
      gap: 0,
      text_direction: 0,
      line_wrap: 0,
      vertical_alignment: 0,
    },
  };
  const paragraphs = [
    {
      section: 0,
      paragraph: 5,
      label: "",
      text: "caption",
      editable: true,
      tableCaption: { tableNode: 2, captionNode: 3, listNode: 4 },
    },
  ];
  const reservation = reserveTableCaptionSpace(
    table,
    paragraphs,
    { x: 100, y: 100, width: 80, height: 60 },
    () => 8,
    0,
  );
  const referenceBoxes = { column: { x: 0, y: 0, width: 400, height: 400 } };
  const layout = {
    state: "placed",
    rows: [],
    boxes: [
      {
        section: 0,
        tableNode: 2,
        listNode: 10,
        pageOrdinal: 1,
        x: 40,
        y: 50,
        width: 80,
        height: 60,
        referenceBoxes,
      },
    ],
  };
  const result = projectTablePageCaption(table, reservation, layout);
  assert.equal(result.state, "placed");
  assert.equal(result.rows.length, reservation.rowCount);
  assert.equal(result.rows[0].x, 40);
  assert.equal(result.rows[0].y, 110);
  assert.equal(result.rows[0].paragraph, 5);
  assert.equal(result.rows[0].pageOrdinal, 1);
  assert.equal(result.rows[0].tableNode, 2);
  assert.equal(result.tableCaptionBounds.length, 1);
  assert.equal(result.tableCaptionBounds[0].captionNode, 3);
  assert.equal(result.tableCaptionBounds[0].listNode, 4);
  const footprint = tableCollisionFootprints(table, result, 0);
  assert.equal(footprint.state, "collected", footprint.error);
  assert.deepEqual(footprint.footprints[0].rectangle, { x: 40, y: 50, width: 80, height: 88 });
  assert.equal(
    tableCollisionFootprints(table, { ...result, tableCaptionBounds: [] }, 0).error,
    "IncompleteTableCaptionCollisionFootprint",
  );
  assert.equal(
    tableCollisionFootprints(
      table,
      { ...result, tableCaptionBounds: [{ ...result.tableCaptionBounds[0], listNode: 99 }] },
      0,
    ).error,
    "IncompleteTableCaptionCollisionFootprint",
  );
  assert.deepEqual(layout.rows, []);
  assert.equal(
    projectTablePageCaption(
      table,
      reservation,
      { ...layout, rows: [{ pageOrdinal: 0, x: 0, y: 0 }] },
      { maxRows: reservation.rowCount },
    ).error,
    "TableCaptionPageProjectionLimit",
  );
  assert.equal(
    projectTablePageCaption(table, reservation, {
      ...layout,
      boxes: [...layout.boxes, { ...layout.boxes[0], pageOrdinal: 2 }],
    }).error,
    "UnsupportedSplitTableCaption",
  );
  assert.equal(
    projectTablePageCaption(table, reservation, {
      ...layout,
      boxes: [{ ...layout.boxes[0], y: 390 }],
    }).error,
    "TableCaptionPageOverflow",
  );
  assert.equal(
    projectTablePageCaption(table, reservation, { ...layout, boxes: [] }).error,
    "UnsupportedSplitTableCaption",
  );
  const inline = { ...table, sourceGeometry: { geometry: { treat_as_character: true } } };
  const narrow = {
    ...layout,
    boxes: [
      {
        ...layout.boxes[0],
        referenceBoxes: {
          column: { x: 40, y: 0, width: 60, height: 400 },
          paper: { x: 0, y: 0, width: 200, height: 400 },
        },
      },
    ],
  };
  assert.equal(
    projectTablePageCaption(table, reservation, narrow).error,
    "TableCaptionPageOverflow",
  );
  assert.equal(projectTablePageCaption(inline, reservation, narrow).state, "placed");
  assert.equal(
    projectTablePageCaption(inline, reservation, {
      ...narrow,
      boxes: [{ ...narrow.boxes[0], x: 150 }],
    }).error,
    "TableCaptionPageOverflow",
  );
});
