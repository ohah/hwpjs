import test from "node:test";
import assert from "node:assert/strict";
import { paginateReservedPictureRows } from "../../web/preview/reserved-picture-page-flow.mjs";
import { pictureTextMeasure } from "../../web/preview/picture-text-measurement.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
import { pageParagraphCoverage } from "../../web/preview/page-paragraph-coverage.mjs";
import { intersectPictureLineRegions } from "../../web/preview/picture-line-intersections.mjs";
import { rowLeft } from "../../web/preview/row-geometry.mjs";

function fixture(wrap = 0) {
  const paragraphs = [{ section: 0, paragraph: 0, text: "\ufffc" }, { section: 0, paragraph: 1, text: "\ufffc" + "a".repeat(60), editable: true }];
  const picture = { state: "located", section: 0, paragraph: 1, pictureNode: 3, anchorUnit: 0,
    geometry: { width: 2250, height: 3000, widthRelative: 4, heightRelative: 2, treatAsCharacter: false, horizontalOffset: 3750, verticalOffset: 0 },
    position: { relations: [2, 3, 0, 0], flags: [false, true, false, false] },
    flow: { textWrap: wrap, textFlow: 0, zOrder: 0, outsideMargins: [0, 0, 0, 0] } };
  const measure = pictureTextMeasure(new Map(), [picture], text => ({ width: text.length * 8, height: 20 }));
  const band = { kind: "gap", section: 0, paragraph: 0, tableIndex: 0, bandOrdinal: 0, height: 40 };
  const rows = [band, ...layoutContent({ paragraphs: [paragraphs[1]], limited: false }, 200, measure, 100, { documentBody: true }).rows];
  const setting = { section_ordinal: 0, width: 15000, height: 22500, orientation: "widely", gutter_type: "left_only", duplicate_margins: 0,
    margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 } };
  const flows = paragraphs.map(p => ({ section: 0, paragraph: p.paragraph, top_level: true, single_column: true, page_break: false, column_break: false }));
  return { paragraphs, picture, rows, setting, flows, measure };
}

test("reserved pagination converges with square fragments and preserves preceding table identity", () => {
  const f = fixture(), before = structuredClone({ rows: f.rows, picture: f.picture, paragraphs: f.paragraphs });
  const result = paginateReservedPictureRows(f.rows, f.setting, f.flows, [f.picture], f.paragraphs, f.measure, { maxRows: 100 });
  assert.equal(result.state, "paginated", result.error);
  assert.equal(result.rows[0].tableIndex, 0); assert.equal(result.rows[0].height, 40);
  assert.equal(result.pictureReservations[0].rectangle.y, 60);
  const body = result.rows.filter(r => r.paragraph === 1);
  assert.ok(body.filter(r => r.y === 60).length === 2);
  assert.equal(pageParagraphCoverage([f.paragraphs[1]], body).state, "complete");
  for (const row of body) {
    const x = rowLeft(row);
    assert.deepEqual(intersectPictureLineRegions({ ...row, x }, result.pictureReservations).regions, [{ x, width: row.width }]);
  }
  assert.ok(result.pictureFlowIterations <= 32);
  assert.deepEqual({ rows: f.rows, picture: f.picture, paragraphs: f.paragraphs }, before);
});

test("top-bottom reservation moves body but retains its original paragraph anchor", () => {
  const f = fixture(1);
  const result = paginateReservedPictureRows(f.rows, f.setting, f.flows, [f.picture], f.paragraphs, f.measure, { maxRows: 100 });
  assert.equal(result.state, "paginated", result.error);
  assert.equal(result.pictureReservations[0].rectangle.y, 60);
  assert.equal(result.rows.find(r => r.paragraph === 1).y, 100);
});

test("reserved pagination rejects callback replacement and non-monotone outer positioning", () => {
  const f = fixture();
  for (const options of [{ measurePositionedRow() {} }, { maxIterations: 0 }, { rowY: 1 }]) {
    assert.equal(paginateReservedPictureRows(f.rows, f.setting, f.flows, [f.picture], f.paragraphs, f.measure, options).error, "InvalidReservedPictureFlow");
  }
  const result = paginateReservedPictureRows(f.rows, f.setting, f.flows, [f.picture], f.paragraphs, f.measure, { rowY: (_row, context) => context.y - 1 });
  assert.equal(result.state, "unavailable");
});

test("caption rows remain separate from body consumption and count against the total budget", () => {
  const f = fixture();
  f.picture.caption = { caption_node: 7, list_node: 8, side: 3, full_size: false, width: 2250, gap: 375,
    last_width: 2250, text_direction: 0, line_wrap: 0, vertical_alignment: 0 };
  const caption = { section: 0, paragraph: 2, text: "설명", editable: true,
    drawingCaption: { drawingNode: 3, captionNode: 7, listNode: 8 } };
  const options = { maxRows: 100, captionParagraphs: [...f.paragraphs, caption] };
  const result = paginateReservedPictureRows(f.rows, f.setting, f.flows, [f.picture], f.paragraphs, f.measure, options);
  assert.equal(result.state, "paginated", result.error);
  assert.equal(result.pictureReservations[0].rectangle.height, 40);
  assert.equal(result.pictureReservations[0].flowRectangle.height, 73);
  assert.equal(result.pictureCaptionRows.map(r => r.text).join(""), caption.text);
  assert.equal(result.rows.some(r => r.paragraph === 2), false);
  assert.equal(pageParagraphCoverage([f.paragraphs[1], caption], [...result.rows.filter(r => r.paragraph === 1), ...result.pictureCaptionRows]).state, "complete");
  const limited = paginateReservedPictureRows(f.rows, f.setting, f.flows, [f.picture], f.paragraphs, f.measure,
    { ...options, maxRows: result.rows.length });
  assert.equal(limited.state, "unavailable");
});
