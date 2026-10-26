import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { partitionPageAreaOwnership } from "../../web/preview/page-area-ownership.mjs";
import { layoutPageAreaInstances } from "../../web/preview/page-area-instance-layout.mjs";
import { pageSequenceReference } from "../../web/preview/page-sequence-reference.mjs";
import { hwpUnitPixels } from "../../web/preview/hwp-units.mjs";

test("real exam header table and drawing repeat with exact source owners on explicit pages", async (t) => {
  const path = "reference/rhwp/samples/hwpx/exam_social.hwpx";
  if (!existsSync(path)) {
    t.skip("reference fixture unavailable");
    return;
  }
  const previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = { postMessage: (reply) => replies.push(reply) };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(async () => {
    try {
      await self.onmessage({ data: { kind: "load", format: "close-audit", bytes: [] } });
    } finally {
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    }
  });
  await import("../../web/preview/reader-worker.mjs?area-source=" + Date.now());
  await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: readFileSync(path) } });
  const reply = replies.shift();
  assert.equal(reply.error, undefined);
  const content = reply.content,
    before = structuredClone(content),
    partition = partitionPageAreaOwnership(content);
  assert.equal(partition.state, "partitioned", partition.error);
  const area = partition.areas.find((area) => area.section === 0 && area.area.owner_node === 293);
  assert.deepEqual(
    area.paragraphs.map((p) => p.paragraph),
    [21, 22, 23],
  );
  assert.deepEqual(
    area.tables.map((table) => table.tableNode),
    [297],
  );
  assert.deepEqual(
    area.drawings.map((drawing) => drawing.drawingNode),
    [307],
  );
  assert.equal(area.host, "header");
  assert.equal(area.area.apply, "odd");
  const source = JSON.parse(
    execFileSync(
      "python3",
      [
        "-B",
        "-c",
        `
import json,sys,zipfile,xml.etree.ElementTree as E
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
r=E.fromstring(zipfile.ZipFile(sys.argv[1]).read('Contents/section0.xml')); n=list(r.iter()); t=n[297]
if t.tag!=p+'tbl' or n[307].tag!=p+'rect': raise ValueError('source identity mismatch')
print(json.dumps(dict(width=int(t.find(p+'sz').get('width')),cells=len(list(t.iter(p+'tc'))))))
`,
        path,
      ],
      { encoding: "utf8", timeout: 30000 },
    ),
  );
  assert.equal(area.tables[0].sourceGeometry.geometry.width, source.width);
  assert.equal(area.tables[0].cells.length, source.cells);
  const setting = content.pageSettings.find((setting) => setting.section_ordinal === 0);
  assert.equal(setting.gutter_type, "left_right");
  assert.equal(setting.margin.gutter, 0);
  assert.equal(setting.margin.left, setting.margin.right);
  const pages = [0, 2].map((ordinal) => {
    const reference = pageSequenceReference(setting, ordinal);
    assert.equal(reference.state, "placed");
    const { paper, page } = reference.boxes;
    return {
      section: 0,
      ordinal,
      number: ordinal + 1,
      paper,
      page,
      header: {
        x: page.x,
        y: paper.y + hwpUnitPixels(setting.margin.top),
        width: page.width,
        height: hwpUnitPixels(setting.margin.header),
      },
      footer: {
        x: page.x,
        y: page.y + page.height,
        width: page.width,
        height: hwpUnitPixels(setting.margin.bottom),
      },
    };
  });
  const result = layoutPageAreaInstances(
    content,
    { ...partition, areas: [area] },
    pages,
    () => 8,
    20000,
  );
  assert.equal(result.state, "placed", result.error);
  assert.equal(result.placedDrawings.length, 2);
  for (const page of pages) {
    assert.equal(
      result.boxes.filter((box) => box.pageOrdinal === page.ordinal).length,
      area.tables[0].cells.length,
    );
    const rows = result.rows.filter((row) => row.pageOrdinal === page.ordinal);
    for (const p of area.paragraphs)
      assert.equal(
        rows
          .filter((row) => row.paragraph === p.paragraph)
          .map((row) => row.text)
          .join(""),
        p.text,
      );
    assert.ok(rows.every((row) => row.section === 0 && row.pageArea === area.host));
    const drawing = result.placedDrawings.find((d) => d.pageOrdinal === page.ordinal);
    assert.equal(drawing.drawingNode, 307);
  }
  assert.deepEqual(content, before);
  const invalid = structuredClone(area);
  invalid.lines.push({ section: 0 });
  const refusal = layoutPageAreaInstances(
    content,
    { ...partition, areas: [invalid] },
    pages,
    () => 8,
    20000,
  );
  assert.equal(refusal.state, "unavailable");
  assert.equal(refusal.rows, undefined);
});
