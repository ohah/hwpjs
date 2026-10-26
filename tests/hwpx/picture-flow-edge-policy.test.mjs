import test from "node:test";
import assert from "node:assert/strict";
import { paginatePictureRows } from "../../web/preview/picture-page-flow.mjs";
import { picturePageLineRegions } from "../../web/preview/picture-page-reservations.mjs";

test("top-bottom reservations retain explicit edge alignment through convergence", () => {
  const setting = {
    width: 15000,
    height: 22500,
    orientation: "widely",
    gutter_type: "left_only",
    duplicate_margins: 0,
    margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
  };
  const paragraphs = [{ section: 0, paragraph: 0, text: "\ufffc" }];
  const flows = [
    {
      section: 0,
      paragraph: 0,
      top_level: true,
      single_column: true,
      page_break: false,
      column_break: false,
    },
  ];
  const rows = [
    {
      kind: "text",
      section: 0,
      paragraph: 0,
      text: "\ufffc",
      startUnit: 0,
      endUnit: 1,
      height: 20,
      width: 200,
    },
  ];
  const picture = {
    state: "located",
    section: 0,
    paragraph: 0,
    anchorUnit: 0,
    pictureNode: 8,
    geometry: {
      treatAsCharacter: false,
      width: 1500,
      height: 1500,
      widthRelative: 4,
      heightRelative: 2,
      horizontalOffset: 0,
      verticalOffset: 0,
    },
    position: { relations: [2, 3, 0, 3] },
    flow: { textWrap: 1, textFlow: 0, outsideMargins: [0, 0, 0, 0] },
  };
  const run = (options) =>
    paginatePictureRows(rows, setting, flows, [picture], paragraphs, options);
  const before = structuredClone({ setting, paragraphs, flows, rows, picture });
  assert.equal(run().error, "unsupported_alignment");
  for (const alignment of [3, 4]) {
    picture.position.relations[3] = alignment;
    const result = run({ edgePolicy: "inside-start-outside-end" });
    assert.equal(result.state, "paginated", result.error);
    assert.equal(result.pictureFlowIterations, 1);
    const reservation = result.pictureReservations[0];
    assert.equal(reservation.rectangle.x, alignment === 3 ? 20 : 200);
    assert.equal(reservation.rectangle.y, 20);
    assert.equal(result.rows[0].y, 40);
    assert.equal(result.rows[0].flowAnchorY, 20);
    const row = result.rows[0];
    assert.equal(
      picturePageLineRegions(row, row.pageOrdinal, result.pictureReservations).regions.length,
      1,
    );
    assert.equal(row.text, paragraphs[0].text);
    assert.equal(run({ edgePolicy: "unknown" }).error, "unsupported_alignment");
  }
  picture.position.relations[3] = 3;
  assert.deepEqual({ setting, paragraphs, flows, rows, picture }, before);
});
