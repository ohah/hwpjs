import test from "node:test";
import assert from "node:assert/strict";
import { measureInlineObjectParagraph } from "../../web/preview/inline-object-paragraph-measurement.mjs";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";

test("explicit overlay anchors keep UTF16 units without inline width or height", () => {
  const paragraph = { section: 0, paragraph: 0, text: "😀\ufffcA\ufffcB" };
  const entry = { objectNode: 7, unit: 4, width: 40, height: 50 };
  const measure = text => ({ width: text.length * 4, height: text === "\ufffc" ? 999 : 12 });
  const before = structuredClone(paragraph);
  const result = measureInlineObjectParagraph(paragraph, [entry], 200, measure, { compactLines: true, zeroWidthUnits: [2] });
  assert.equal(result.state, "measured", result.error);
  assert.equal(result.rows.map(row => row.text).join(""), paragraph.text);
  const row = result.rows[0];
  assert.equal(row.boundaries.find(b => b.unit === 2).x, row.boundaries.find(b => b.unit === 3).x);
  assert.equal(result.anchors.length, 1);
  assert.equal(result.anchors[0].unit, 4);
  assert.equal(result.anchors[0].width, 40);
  assert(result.height < 999, "overlay placeholder must not increase line height");
  assert.deepEqual(paragraph, before);
  for (const zeroWidthUnits of [[2, 2], [1], [-1], [NaN], [4], null]) {
    assert.equal(measureInlineObjectParagraph(paragraph, [entry], 200, measure, { zeroWidthUnits }).state, "unavailable");
  }
  assert.equal(measureInlineObjectParagraph(paragraph, [entry], 200, measure).error, "AmbiguousInlineObjectAnchors");
});

test("actual mixed nested host reaches original inline width refusal without dropping overlay", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit field display candidate required");
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: readFileSync("reference/rhwp/samples/issue5712/3184241_medical_exam_equipment.hwpx") });
  assert.equal(loaded.error, undefined);
  const before = structuredClone(loaded.content);
  const nested = loaded.content.tables.filter(table => table.parentTableNode !== null);
  assert.deepEqual(nested.map(table => [table.tableNode, table.hostParagraph, table.anchorUnit, table.sourceGeometry.geometry.treat_as_character]),
    [[418, 38, 0, false], [1064, 38, 1, true]]);
  const result = layoutTableBodyContent(loaded.content, text => ({ width: text.length * 4, height: 12 }), 20000);
  assert.equal(result.error, "InlineObjectLineWidthOverflow");
  assert.equal(result.paragraph, 38);
  assert.equal(result.objects.length, 1);
  assert.equal(result.objects[0].objectNode, 1064);
  assert(result.objects[0].width > result.availableWidth);
  assert.equal(result.rows, undefined, "no partially successful layout for a refused document");
  assert.deepEqual(loaded.content, before);
});
