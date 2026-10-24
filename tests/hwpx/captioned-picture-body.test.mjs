import test from "node:test";
import assert from "node:assert/strict";
import { layoutPictureBodyContent } from "../../web/preview/picture-body-content-layout.mjs";
import { picturePageReservations } from "../../web/preview/picture-page-reservations.mjs";
import { intersectPictureLineRegions } from "../../web/preview/picture-line-intersections.mjs";
import { previewPictureLayers } from "../../web/preview/picture-layers.mjs";

function fixture(wrap = 0) {
  const caption = { caption_node: 7, list_node: 8, side: 3, full_size: false, width: 2250, gap: 375, last_width: 2250, text_direction: 0, line_wrap: 0, vertical_alignment: 0 };
  return {
    paragraphs: [{ section: 0, paragraph: 0, text: "\ufffc" + "a".repeat(60), editable: true },
      { section: 0, paragraph: 1, text: "설명", editable: true, drawingCaption: { drawingNode: 3, captionNode: 7, listNode: 8 } }],
    paragraphFlows: [{ section: 0, paragraph: 0, host: "body", top_level: true, single_column: true, page_break: false, column_break: false },
      { section: 0, paragraph: 1, host: "other", top_level: false, single_column: true }],
    pageSettings: [{ section_ordinal: 0, width: 15000, height: 22500, orientation: "widely", gutter_type: "left_only", duplicate_margins: 0,
      margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 } }],
    pictures: [{ state: "located", section: 0, paragraph: 0, pictureNode: 3, anchorUnit: 0, owner: { paragraph: 0, anchorNode: 3, anchorUnit: 0 },
      geometry: { width: 2250, height: 1500, widthRelative: 4, heightRelative: 2, treatAsCharacter: false, horizontalOffset: 3750, verticalOffset: 0 },
      position: { relations: [2, 3, 0, 0], flags: [false, true, false, false] },
      flow: { textWrap: wrap, textFlow: 0, zOrder: 0, outsideMargins: [0, 0, 0, 0] },
      crop: { clip: [0, 2250, 0, 1500] }, transform: { identity: true }, caption }],
  };
}

const measure = text => ({ width: text.length * 8, height: 20 });

test("square picture and caption reserve a compound frame but preserve the original image rectangle", () => {
  const content = fixture(), before = structuredClone(content);
  const result = layoutPictureBodyContent(content, measure, 100);
  assert.equal(result.state, "paginated", result.error);
  const placed = result.flowPictures[0];
  assert.deepEqual(placed.rectangle, { x: 70, y: 20, width: 30, height: 20 });
  assert.deepEqual(placed.captionRectangle, { x: 70, y: 45, width: 30, height: 28 });
  assert.deepEqual(placed.flowRectangle, { x: 70, y: 20, width: 30, height: 53 });
  const body = result.rows.filter(row => row.paragraph === 0);
  assert.equal(body.map(row => row.text).join(""), content.paragraphs[0].text);
  for (const row of body) {
    const region = intersectPictureLineRegions(row, result.pictureReservations);
    assert.deepEqual(region.regions, [{ x: row.x, width: row.width }]);
  }
  const captionRows = result.rows.filter(row => row.paragraph === 1);
  assert.equal(captionRows.map(row => row.text).join(""), "설명");
  assert.ok(captionRows.every(row => row.pictureNode === 3 && row.pageOrdinal === 0));
  const layers = previewPictureLayers(content, result, 200);
  assert.equal(layers.front.length, 1);
  assert.equal(layers.front[0].height, 20);
  assert.deepEqual(content, before);
});

test("top-bottom picture reserves caption and gap before body text, with a stable source anchor", () => {
  const content = fixture(1);
  const result = layoutPictureBodyContent(content, measure, 100);
  assert.equal(result.state, "paginated", result.error);
  assert.equal(result.rows.find(row => row.paragraph === 0).y, 73);
  assert.equal(result.rows.find(row => row.paragraph === 0).flowAnchorY, 20);
  assert.equal(result.flowPictures[0].rectangle.y, 20);
  assert.ok(result.pictureFlowIterations <= 32);
});

test("captioned picture flow refuses missing measurement, unsupported composition, and page overflow", () => {
  const content = fixture();
  const result = layoutPictureBodyContent(content, measure, 100);
  assert.equal(picturePageReservations(content.pictures, content.paragraphs, result.rows.filter(r => r.paragraph === 0)).error, "MissingPictureCaptionMeasurement");
  const table = fixture(); table.tables = [{}];
  assert.equal(layoutPictureBodyContent(table, measure, 100).error, "UnsupportedCaptionedPictureBodyObjects");
  const overflow = fixture(); overflow.pictures[0].geometry.verticalOffset = 250 * 75;
  assert.equal(layoutPictureBodyContent(overflow, measure, 100).error, "PictureCaptionPageOverflow");
  const unknown = fixture(); unknown.paragraphFlows = [];
  assert.equal(layoutPictureBodyContent(unknown, measure, 100).error, "UnsupportedCaptionedPictureBodyFlow");
  assert.equal(layoutPictureBodyContent(fixture(), measure, 0).error, "InvalidPictureCaptionBudget");
});


test("caption frame separates image geometry from occupied bounds and rejects invalid inputs", async () => {
  const { measurePictureCaptionFrame } = await import("../../web/preview/picture-caption-frame.mjs");
  const content = fixture(), before = structuredClone(content), rectangle = {x:31,y:47,width:30,height:20};
  const result = measurePictureCaptionFrame(content.pictures[0],content.paragraphs,rectangle,measure);
  assert.equal(result.state,"measured",result.error); assert.deepEqual(result.rectangle,rectangle);
  assert.deepEqual(result.captionRectangle,{x:31,y:72,width:30,height:28});
  assert.deepEqual(result.flowRectangle,{x:31,y:47,width:30,height:53});
  assert.equal(result.rows.map(row=>row.text).join(""),"설명");
  assert(result.rows.every(row=>row.pictureNode===3&&row.captionNode===7&&row.listNode===8));
  for (const change of [{x:Infinity},{width:0},{height:-1},{x:Number.MAX_VALUE,width:Number.MAX_VALUE}]) assert.equal(measurePictureCaptionFrame(content.pictures[0],content.paragraphs,{...rectangle,...change},measure).error,"InvalidPictureCaptionRectangle");
  for (const maxRows of [0,-1,NaN,0.5]) assert.equal(measurePictureCaptionFrame(content.pictures[0],content.paragraphs,rectangle,measure,{maxRows}).error,"PictureCaptionRowLimit");
  assert.equal(measurePictureCaptionFrame(content.pictures[0],[],rectangle,measure).error,"MissingDrawingCaptionContent");
  assert.deepEqual(content,before);
});
