import test from "node:test";
import assert from "node:assert/strict";
import { previewPictureLayers } from "../../web/preview/picture-layers.mjs";

function fixture() {
  const picture = { section: 0, paragraph: 3, pictureNode: 9, anchorUnit: 0, state: "located", transform: { identity: true },
    geometry: { treatAsCharacter: false, width: 1500, height: 1500, widthRelative: 4, heightRelative: 2 },
    flow: { textWrap: 3, zOrder: 0 }, crop: { clip: [0, 1500, 0, 1500] } };
  const content = { paragraphs: [{ section: 0, paragraph: 3, text: "\ufffc", tableCell: { tableNode: 4 } }], pictures: [picture] };
  const layout = { height: 1000, rows: [0, 1].map(pageOrdinal => ({ kind: "text", section: 0, paragraph: 3,
    pageOrdinal, columnOrdinal: 0, startUnit: 0, endUnit: 1, x: 10, y: pageOrdinal * 500, width: 100, height: 20 })),
    flowPictures: [0, 1].map(pageOrdinal => ({ section: 0, pictureNode: 9, pageOrdinal, columnOrdinal: 0,
      rectangle: { x: 10, y: pageOrdinal * 500, width: 20, height: 20 } })) };
  return { content, layout };
}

test("one source picture paints every explicit repeated page instance", () => {
  const { content, layout } = fixture(), before = structuredClone({ content, layout });
  const layers = previewPictureLayers(content, layout, 200);
  assert.deepEqual(layers.front.map(item => item.y), [0, 500]);
  assert.ok(layers.front.every(item => item.picture === content.pictures[0]));
  assert.deepEqual({ content, layout }, before);
});

test("repeated pictures cannot borrow an anchor row from a different page", () => {
  const { content, layout } = fixture(); layout.rows.pop();
  assert.deepEqual(previewPictureLayers(content, layout, 200).front.map(item => item.y), [0]);
});

test("same-page columns retain separate picture instances and ambiguous instances fail closed", () => {
  const { content, layout } = fixture();
  for (const rows of [layout.rows, layout.flowPictures]) rows.forEach((item, i) => { item.pageOrdinal = 0; item.columnOrdinal = i; });
  assert.equal(previewPictureLayers(content, layout, 200).front.length, 2);
  layout.rows.pop();
  assert.equal(previewPictureLayers(content, layout, 200).front.length, 1);
  layout.flowPictures[1].columnOrdinal = 0;
  assert.equal(previewPictureLayers(content, layout, 200).front.length, 0);
  layout.flowPictures[1].columnOrdinal = -1;
  assert.equal(previewPictureLayers(content, layout, 200).front.length, 0);
});

test("invalid repeated rectangle is not emitted as a successful paint layer", () => {
  const { content, layout } = fixture(); layout.flowPictures[1].rectangle.width = Infinity;
  assert.deepEqual(previewPictureLayers(content, layout, 200).front.map(item => item.y), [0]);
});
