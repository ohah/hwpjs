import test from "node:test";
import assert from "node:assert/strict";
import { measureInlineObjectParagraph } from "../../web/preview/inline-object-paragraph-measurement.mjs";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { measureNestedTable } from "../../web/preview/nested-table-measurement.mjs";

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

test("actual mixed nested host preserves oversized width in visible page placement", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit field display candidate required");
  const h = await workerCanvasHarness(t);
  const input = readFileSync("reference/rhwp/samples/issue5712/3184241_medical_exam_equipment.hwpx");
  const independent = JSON.parse(execFileSync("python3", ["-c", `import base64,io,json,sys,zipfile,xml.etree.ElementTree as E
n='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(io.BytesIO(base64.b64decode(json.load(sys.stdin)['bytes']))) as z:r=E.fromstring(z.read('Contents/section0.xml'))
parents={c:p for p in r.iter() for c in p}
tables=list(r.iter(n+'tbl'));child=next(t for t in tables if t.find(n+'pos').get('treatAsChar')=='1')
cell=parents[child]
while cell.tag!=n+'tc':cell=parents[cell]
owner=parents[cell]
while owner.tag!=n+'tbl':owner=parents[owner]
margin=cell.find(n+'cellMargin') if cell.get('hasMargin')=='1' else owner.find(n+'inMargin')
outer=child.find(n+'outMargin')
print(json.dumps({'cellWidth':int(cell.find(n+'cellSz').get('width')),'cellHasMargin':cell.get('hasMargin'),'cellLeft':int(margin.get('left')),'cellRight':int(margin.get('right')),'childWidth':int(child.find(n+'sz').get('width')),'childLeft':int(outer.get('left')),'childRight':int(outer.get('right'))}))`], {
    input: JSON.stringify({ bytes: input.toString("base64") }), encoding: "utf8", timeout: 30000,
  }));
  assert.deepEqual(independent, { cellWidth: 47730, cellHasMargin: "0", cellLeft: 283, cellRight: 283, childWidth: 48008, childLeft: 141, childRight: 141 });
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  const before = structuredClone(loaded.content);
  const nested = loaded.content.tables.filter(table => table.parentTableNode !== null);
  assert.deepEqual(nested.map(table => [table.tableNode, table.hostParagraph, table.anchorUnit, table.sourceGeometry.geometry.treat_as_character]),
    [[418, 38, 0, false], [1064, 38, 1, true]]);
  const measure = text => ({ width: text.length * 4, height: 12 });
  const result = measureNestedTable(loaded.content, loaded.content.tables[0], measure);
  assert.equal(result.error, "InlineObjectLineWidthOverflow");
  assert.equal(result.paragraph, 38);
  assert.equal(result.objects.length, 1);
  assert.equal(result.objects[0].objectNode, 1064);
  assert(Math.abs(result.availableWidth - (independent.cellWidth - independent.cellLeft - independent.cellRight) / 75) < 1e-8);
  assert(Math.abs(result.objects[0].width - (independent.childWidth + independent.childLeft + independent.childRight) / 75) < 1e-8);
  assert(result.objects[0].width > result.availableWidth);
  assert.equal(result.rows, undefined, "no partially successful layout for a refused document");
  const visible = layoutTableBodyContent(loaded.content, measure, 20000);
  assert.equal(visible.state, "paginated", visible.error);
  assert.equal(visible.boxes.length, loaded.content.tables.reduce((sum, table) => sum + table.cells.length, 0));
  assert.equal(new Set(visible.boxes.map(box => `${box.tableNode}:${box.listNode}`)).size, visible.boxes.length);
  const childBoxes = visible.boxes.filter(box => box.tableNode === 1064);
  assert(Math.abs(Math.max(...childBoxes.map(box => box.x + box.width)) - Math.min(...childBoxes.map(box => box.x)) - independent.childWidth / 75) < 1e-8);
  assert(childBoxes.every(box => box.pageClip === undefined), "visible overflow must not acquire a cell clip");
  for (const box of visible.boxes.filter(box => box.depth > 0)) {
    const paper = box.referenceBoxes.paper;
    assert(box.x >= paper.x - 1e-8 && box.y >= paper.y - 1e-8);
    assert(box.x + box.width <= paper.x + paper.width + 1e-8 && box.y + box.height <= paper.y + paper.height + 1e-8);
  }
  assert.deepEqual(loaded.content, before);
});
