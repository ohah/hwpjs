import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";
import { tablePageAnchorError } from "../../web/preview/table-page-anchor-policy.mjs";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { pageParagraphCoverage } from "../../web/preview/page-paragraph-coverage.mjs";

test("actual table anchor refusal identifies page-bottom owner without normalizing source", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "explicit field display candidate required");
  const input = readFileSync(
    "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx",
  );
  const independent = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import base64,io,json,sys,zipfile,xml.etree.ElementTree as E
with zipfile.ZipFile(io.BytesIO(base64.b64decode(json.load(sys.stdin)['bytes']))) as z:
 root=E.fromstring(z.read('Contents/section0.xml'))
 ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
 print(json.dumps([{'width':int(n.find(ns+'sz').attrib['width']),'vertical':n.find(ns+'pos').attrib['vertRelTo'],'align':n.find(ns+'pos').attrib['vertAlign'],'wrap':n.attrib['textWrap']} for n in root.iter(ns+'tbl')]))`,
      ],
      {
        input: JSON.stringify({ bytes: input.toString("base64") }),
        encoding: "utf8",
        timeout: 30000,
      },
    ),
  );
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  const before = structuredClone(loaded.content);
  const refused = loaded.content.tables.filter((row) => tablePageAnchorError(row.sourceGeometry));
  assert.deepEqual(
    refused.map((row) => ({
      node: row.tableNode,
      host: row.hostParagraph,
      reason: tablePageAnchorError(row.sourceGeometry),
    })),
    [{ node: 1068, host: 30, reason: "UnsupportedTableTextWrap" }],
  );
  const pageBottom = loaded.content.tables.find((row) => row.tableNode === 381);
  const xml = independent.find((row) => row.width === pageBottom.sourceGeometry.geometry.width);
  assert.equal(xml.vertical, "PAGE");
  assert.equal(xml.align, "BOTTOM");
  assert.equal(pageBottom.sourceGeometry.vertical_relative, 1);
  assert.equal(pageBottom.sourceGeometry.vertical_alignment, 2);
  assert.equal(tablePageAnchorError(pageBottom.sourceGeometry), null);
  const behind = independent.find((row) => row.width === refused[0].sourceGeometry.geometry.width);
  assert.equal(behind.wrap, "BEHIND_TEXT");
  assert.equal(behind.align, "BOTTOM");
  const layout = layoutTableBodyContent(loaded.content, (text) => text.length * 8, 20000);
  assert.equal(layout.error, "NestedFloatingTableMeasuredOverflow");
  assert.equal(layout.tableNode, 391);
  assert.equal(layout.parentTableNode, 381);
  assert.equal(h.renderer.layout().pageLayoutError, undefined);
  const actual = layoutTableBodyContent(
    loaded.content,
    (text) => ({ width: text.length * 4, height: 12 }),
    20000,
  );
  assert.equal(actual.state, "paginated", actual.error);
  assert.equal(
    actual.boxes.length,
    loaded.content.tables.reduce((sum, table) => sum + table.cells.length, 0),
  );
  assert.equal(
    new Set(actual.boxes.map((box) => `${box.tableNode}:${box.listNode}`)).size,
    actual.boxes.length,
  );
  const parentBox = actual.boxes.find((box) => box.tableNode === 381);
  const childLeft = Math.min(
    ...actual.boxes.filter((box) => box.tableNode === 391).map((box) => box.x),
  );
  const child = loaded.content.tables.find((table) => table.tableNode === 391);
  assert(
    Math.abs(
      childLeft - (parentBox.x + (parentBox.width - child.sourceGeometry.geometry.width / 75) / 2),
    ) < 1e-8,
  );
  const coverage = actual.rows.filter((row) => row.kind === "text").map((row) => ({ ...row }));
  // Consumed root table anchors are checked as intervals, not invented render rows.
  for (const anchor of actual.tableAnchors) {
    const owner = loaded.content.paragraphs.find(
      (p) => p.section === anchor.section && p.paragraph === anchor.hostParagraph,
    );
    assert.equal(owner.text[anchor.anchorUnit], "\ufffc");
    if (
      !coverage.some(
        (row) =>
          row.section === anchor.section &&
          row.paragraph === anchor.hostParagraph &&
          row.startUnit <= anchor.anchorUnit &&
          row.endUnit > anchor.anchorUnit,
      )
    )
      coverage.push({
        kind: "text",
        section: anchor.section,
        paragraph: anchor.hostParagraph,
        startUnit: anchor.anchorUnit,
        endUnit: anchor.anchorUnit + 1,
        text: "\ufffc",
      });
  }
  assert.equal(pageParagraphCoverage(loaded.content.paragraphs, coverage).state, "complete");
  const corrupted = coverage.map((row) => ({ ...row }));
  corrupted[0].text = "wrong";
  assert.equal(pageParagraphCoverage(loaded.content.paragraphs, corrupted).state, "unavailable");
  assert.deepEqual(loaded.content, before);
});
