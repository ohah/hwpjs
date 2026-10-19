import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";

test("real cell-split inline table retains every cell and source unit across page bands", async t => {
  const path = "reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx";
  if (!existsSync(path)) { t.skip("reference fixture unavailable"); return; }
  const expected = JSON.parse(execFileSync("python3", ["-B", "-c", `
import json,sys,zipfile,xml.etree.ElementTree as E
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
r=E.fromstring(zipfile.ZipFile(sys.argv[1]).read('Contents/section0.xml'))
t=list(r.iter())[2369]
if t.tag!=p+'tbl': raise ValueError('target table mismatch')
print(json.dumps(dict(rows=int(t.get('rowCnt')),policy=t.get('pageBreak'),inline=t.find(p+'pos').get('treatAsChar'),cells=[dict(row=int(c.find(p+'cellAddr').get('rowAddr')),rowSpan=int(c.find(p+'cellSpan').get('rowSpan'))) for tr in t.findall(p+'tr') for c in tr.findall(p+'tc')])))
`, path], { encoding: "utf8", timeout: 30000 }));
  assert.equal(expected.rows, 21); assert.equal(expected.policy, "CELL"); assert.equal(expected.inline, "1");
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage: reply => replies.push(reply) };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(async () => {
    try { await self.onmessage({ data: { kind: "load", format: "close-audit", bytes: [] } }); }
    finally { globalThis.self = previousSelf; globalThis.fetch = previousFetch; }
  });
  await import("../../web/preview/reader-worker.mjs?inline-split-body=" + Date.now());
  await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: readFileSync(path) } });
  const reply = replies.shift(); assert.equal(reply.error, undefined);
  const table = reply.content.tables.find(table => table.tableNode === 2369);
  assert.equal(table.hostParagraph, 225);
  assert.deepEqual(table.cells.map(({ row, rowSpan }) => ({ row, rowSpan })), expected.cells);
  // Isolate this source table; whole-document area/drawing composition has its own audit.
  const ids = new Set([table.hostParagraph, ...table.cells.flatMap(cell => cell.paragraphs)]);
  const content = { ...reply.content, tables: [table], pictures: [], drawings: [], lines: [],
    paragraphs: reply.content.paragraphs.filter(p => ids.has(p.paragraph)),
    paragraphFlows: reply.content.paragraphFlows.filter(p => ids.has(p.paragraph)) };
  const before = structuredClone(content);
  const measure = text => ({ width: text.length * 8, height: 40 });
  const result = layoutTableBodyContent(content, measure, 20000);
  assert.equal(result.state, "paginated", result.error);
  assert.ok(result.pages.length > 1);
  assert.equal(result.boxes.length, table.cells.length);
  for (const cell of table.cells) {
    const boxes = result.boxes.filter(box => box.listNode === cell.listNode);
    assert.equal(boxes.length, 1, "merged cell must remain on one page");
    for (const id of cell.paragraphs) {
      const source = content.paragraphs.find(p => p.paragraph === id);
      const rows = result.rows.filter(row => row.kind === "text" && row.paragraph === id);
      assert.equal(rows.map(row => row.text).join(""), source.text, `paragraph ${id}`);
      assert.ok(rows.every(row => row.pageOrdinal === boxes[0].pageOrdinal));
    }
  }
  assert.deepEqual(content, before);
  const noSplit = structuredClone(content); noSplit.tables[0].pagination.page_break = "none";
  assert.equal(layoutTableBodyContent(noSplit, measure, 20000).error, "UnsupportedPageRow");
  const spanning = structuredClone(content);
  spanning.tables[0].cells[0].rowSpan = 21;
  assert.equal(layoutTableBodyContent(spanning, measure, 20000).state, "unavailable");
});
