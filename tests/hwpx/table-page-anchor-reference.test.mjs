import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";
import { tablePageAnchorError } from "../../web/preview/table-page-anchor-policy.mjs";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("actual table anchor refusal identifies page-bottom owner without normalizing source", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit field display candidate required");
  const input = readFileSync("reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx");
  const independent = JSON.parse(execFileSync("python3", ["-c", `import base64,io,json,sys,zipfile,xml.etree.ElementTree as E
with zipfile.ZipFile(io.BytesIO(base64.b64decode(json.load(sys.stdin)['bytes']))) as z:
 root=E.fromstring(z.read('Contents/section0.xml'))
 ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
 print(json.dumps([{'width':int(n.find(ns+'sz').attrib['width']),'vertical':n.find(ns+'pos').attrib['vertRelTo'],'align':n.find(ns+'pos').attrib['vertAlign'],'wrap':n.attrib['textWrap']} for n in root.iter(ns+'tbl')]))`], { input: JSON.stringify({ bytes: input.toString("base64") }), encoding: "utf8", timeout: 30000 }));
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  const before = structuredClone(loaded.content);
  const refused = loaded.content.tables.filter(row => tablePageAnchorError(row.sourceGeometry));
  assert.deepEqual(refused.map(row => ({ node: row.tableNode, host: row.hostParagraph, reason: tablePageAnchorError(row.sourceGeometry) })), [
    { node: 381, host: 29, reason: "UnsupportedTableVerticalReference" },
    { node: 1068, host: 30, reason: "UnsupportedTableTextWrap" },
  ]);
  const pageBottom = refused[0];
  const xml = independent.find(row => row.width === pageBottom.sourceGeometry.geometry.width);
  assert.equal(xml.vertical, "PAGE"); assert.equal(xml.align, "BOTTOM");
  assert.equal(pageBottom.sourceGeometry.vertical_relative, 1);
  assert.equal(pageBottom.sourceGeometry.vertical_alignment, 2);
  const behind = independent.find(row => row.width === refused[1].sourceGeometry.geometry.width);
  assert.equal(behind.wrap, "BEHIND_TEXT");
  assert.equal(behind.align, "BOTTOM");
  const layout = layoutTableBodyContent(loaded.content, text => text.length * 8, 20000);
  assert.equal(layout.error, "UnsupportedTablePageAnchor");
  assert.equal(layout.tableNode, 381);
  assert.equal(layout.anchorReason, "UnsupportedTableVerticalReference");
  assert.equal(h.renderer.layout().pageLayoutTableNode, 381);
  assert.equal(h.canvas.dataset.pageLayoutAnchorReason, "UnsupportedTableVerticalReference");
  assert.deepEqual(loaded.content, before);
});
