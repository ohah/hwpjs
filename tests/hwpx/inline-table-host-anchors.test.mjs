import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { inlineTableHostAnchors } from "../../web/preview/inline-table-host-anchors.mjs";
import { measureInlineTableParagraph } from "../../web/preview/inline-table-paragraph-measurement.mjs";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";

const anchor = (node, anchorUnit) => ({ section: 0, paragraph: 42, node, anchorUnit });

async function workerReplies(t) {
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage: value => replies.push(value) };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(() => { globalThis.self = previousSelf; globalThis.fetch = previousFetch; });
  await import(`../../web/preview/reader-worker.mjs?inline-host=${Date.now()}-${Math.random()}`);
  return replies;
}

test("inline table and floating drawing anchors retain separate source units", () => {
  const paragraph = { section: 0, paragraph: 42, text: "\ufffc\ufffc\ufffc" };
  const tables = [anchor(10, 0), anchor(30, 2)], overlays = [anchor(20, 1)];
  const before = structuredClone({ paragraph, tables, overlays });
  const partition = inlineTableHostAnchors(paragraph, tables, overlays);
  assert.equal(partition.state, "resolved"); assert.deepEqual(partition.zeroWidthUnits, [1]);
  const result = measureInlineTableParagraph(paragraph, [{ tableNode: 10, unit: 0, width: 20, height: 30 }, { tableNode: 30, unit: 2, width: 30, height: 30 }],
    200, () => ({ width: 8, height: 20 }), partition);
  assert.equal(result.state, "measured", result.error);
  assert.deepEqual(result.anchors.map(a => [a.tableNode, a.unit, a.x]), [[10, 0, 0], [30, 2, 20]]);
  assert.equal(result.rows.filter(r => r.kind === "text").map(r => r.text).join(""), paragraph.text);
  assert.deepEqual({ paragraph, tables, overlays }, before);
});

test("inline host anchor partition refuses unknown, duplicate and foreign sources", () => {
  const p = { section: 0, paragraph: 42, text: "\ufffc\ufffc\ufffc" };
  for (const overlays of [[], [anchor(20, 0)], [anchor(10, 1)], [{ ...anchor(20, 1), section: 1 }], [anchor(20, -1)], [anchor(20, 1), anchor(21, 1)]]) {
    assert.equal(inlineTableHostAnchors(p, [anchor(10, 0), anchor(30, 2)], overlays).state, "unavailable");
  }
  const retained = inlineTableHostAnchors(p, [anchor(10, 0)], [anchor(20, 1)], [anchor(30, 2)]);
  assert.deepEqual(retained.textAnchorUnits, [2]);
  assert.equal(inlineTableHostAnchors(p, [anchor(10, 0)], [anchor(20, 1)], [anchor(30, 1)]).state, "unavailable");
});

test("real carried-anchor source independently contains table, rectangle, table in one paragraph", async t => {
  const file = "reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx";
  if (!existsSync(file)) { t.skip("reference fixture unavailable"); return; }
  const tags = JSON.parse(execFileSync("python3", ["-c", "import sys,json,zipfile,xml.etree.ElementTree as E; n='{http://www.hancom.co.kr/hwpml/2011/paragraph}'; r=E.fromstring(zipfile.ZipFile(sys.argv[1]).read('Contents/section0.xml')); p=list(r.iter(n+'p'))[42]; print(json.dumps([c.tag.split('}')[-1] for run in p if run.tag==n+'run' for c in run]))", file], { encoding: "utf8" }));
  assert.deepEqual(tags, ["tbl", "rect", "tbl", "t"]);
  const replies = await workerReplies(t);
  await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: readFileSync(file) } });
  assert.equal(replies.length, 1); const reply = replies.shift(); assert.equal(reply.error, undefined);
  const content = reply.content, before = JSON.stringify(content);
  const p = content.paragraphs.find(p => p.section === 0 && p.paragraph === 42);
  const tables = content.tables.filter(table => table.section === 0 && table.hostParagraph === 42).map(table => anchor(table.tableNode, table.anchorUnit));
  const drawings = content.drawings.filter(d => d.section === 0 && d.hostParagraph === 42).map(d => anchor(d.drawingNode, d.anchorUnit));
  assert.deepEqual(tables.map(a => a.anchorUnit), [0, 2]);
  assert.deepEqual(drawings.map(a => a.anchorUnit), [1]);
  assert.deepEqual(inlineTableHostAnchors(p, tables, drawings), { state: "resolved", zeroWidthUnits: [1], textAnchorUnits: [] });
  assert.equal(JSON.stringify(content), before);
});

test("tracked table-derived inline scene retains an additional zero-width drawing anchor without moving cells", async t => {
  const replies = await workerReplies(t);
  await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table2.hwpx") } });
  const tableReply = replies.shift(); assert.equal(tableReply.error, undefined);
  const scene = tableReply.content;
  for (const table of scene.tables) table.sourceGeometry.geometry.treat_as_character = true;
  const baseline = layoutTableBodyContent(scene, () => 8, 20000);
  assert.equal(baseline.state, "paginated", baseline.error);
  const table = scene.tables[0], host = scene.paragraphs.find(p => p.section === table.section && p.paragraph === table.hostParagraph);
  const unit = host.text.length; host.text += "\ufffc";
  scene.floatingDrawingAnchors = [{ section: host.section, paragraph: host.paragraph, anchorUnit: unit, node: 1000000 }];
  const mixedBefore = JSON.stringify(scene);
  const mixed = layoutTableBodyContent(scene, () => 8, 20000);
  assert.equal(mixed.state, "paginated", mixed.error);
  assert.deepEqual(mixed.boxes.map(b => [b.tableNode, b.x, b.y, b.width, b.height]), baseline.boxes.map(b => [b.tableNode, b.x, b.y, b.width, b.height]));
  assert.equal(mixed.rows.filter(r => r.paragraph === host.paragraph && r.kind === "text").map(r => r.text).join(""), host.text);
  assert.equal(JSON.stringify(scene), mixedBefore);
});
