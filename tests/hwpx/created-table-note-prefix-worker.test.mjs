import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";
import { layoutCreatedTable } from "../../web/preview/created-table-layout.mjs";
import { measureCreatedTableHost } from "../../web/preview/created-table-host-measurement.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("Canvas paints a projected host prefix once rather than once per source fragment", async t => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx") })).error, undefined);
  const enabled = await h.send({ kind: "enable" });
  assert.equal(enabled.error, undefined);
  const resources = Object.fromEntries(Object.entries(enabled.content.tableCreationResources).map(([key, values]) => [key, values[0]]));
  const created = await h.send({ kind: "insert-table", section: 0, paragraph: 1, unit: 1,
    options: { rows: 1, columns: 1, width: 7200, rowHeight: 1800, resources } });
  assert.equal(created.error, undefined);
  h.paint();
  const content = structuredClone(created.content);
  content.paragraphs.find(p => p.paragraph === 1).automaticNumberPrefixes = [{ source: { values: { type_known: true, num: 7 }, format: { type_known: true, supscript: false, raw: ["DIGIT", "", "", "."] } } }];
  const painted = [];
  h.canvas.getContext("2d").fillText = (...args) => painted.push(args);
  h.renderer.show(content);
  assert.equal(h.renderer.layout().pageLayoutMode, "measured-created-inline");
  assert.equal(h.renderer.layout().hostNumberPrefixes.length, 1);
  h.paint();
  assert.equal(painted.filter(([text]) => text === "7.").length, 1);
});

test("actual note-host generated table preserves its retained prefix and native history", async t => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const bytes = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx");
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes })).error, undefined);
  const enabled = await h.send({ kind: "enable" });
  assert.equal(enabled.error, undefined);
  const target = enabled.content.paragraphs.find(p => p.automaticNumberPrefixes?.length);
  assert(target);
  const resources = Object.fromEntries(Object.entries(enabled.content.tableCreationResources).map(([key, values]) => [key, values[0]]));
  const created = await h.send({ kind: "insert-table", section: target.section, paragraph: target.paragraph, unit: 0,
    options: { rows: 1, columns: 1, width: 7200, rowHeight: 1800, resources } });
  assert.equal(created.error, undefined);
  const changed = await h.send({ kind: "created-cell-text", section: target.section, identity: created.identity, row: 0, column: 0, text: "각주표😀" });
  assert.equal(changed.error, undefined);
  const host = changed.content.paragraphs.find(p => p.section === target.section && p.paragraph === target.paragraph);
  assert.equal(host.text, target.text);
  assert.deepEqual(host.automaticNumberPrefixes, target.automaticNumberPrefixes);
  const table = changed.content.createdTables[0], measure = text => ({ width: [...text].length * 8, height: 16 });
  const cells = layoutCreatedTable(table, measure);
  const flow = measureCreatedTableHost(host, [{ table, width: cells.width, height: cells.height }], 500, measure);
  assert.equal(flow.state, "measured", flow.error);
  assert.equal(flow.numberPrefixes.length, 1);
  assert.equal(flow.numberPrefixes[0].numberPrefix.text, "1)");
  assert.equal(flow.rows.map(row => row.text).join(""), target.text);
  assert.notEqual(h.renderer.layout().createdTablesPaginated, true, "note-page table composition remains a separate implementation");
  h.paint();
  const saved = await h.send({ kind: "save" }); assert.equal(saved.error, undefined);
  execFileSync("python3", ["-c", "import sys,json,base64,io,zipfile,xml.etree.ElementTree as E; d=json.load(sys.stdin); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after']))); ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'; part='Contents/section0.xml'; before=E.fromstring(a.read(part)); after=E.fromstring(b.read(part)); notes=list(after.iter(ns+'footNote')); assert len(notes)==2; tables=list(notes[0].iter(ns+'tbl')); assert len(tables)==1; assert ''.join(''.join(t.itertext()) for t in tables[0].iter(ns+'t'))=='각주표😀'; assert [E.tostring(n) for n in before.iter(ns+'autoNum')]==[E.tostring(n) for n in after.iter(ns+'autoNum')]; assert all(a.read(n)==b.read(n) for n in a.namelist() if n!=part)"], { input: JSON.stringify({ before: bytes.toString("base64"), after: Buffer.from(saved.bytes).toString("base64") }), timeout: 30000 });
  assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), bytes);
  assert.equal((await h.send({ kind: "redo" })).error, undefined);
  const redone = await h.send({ kind: "redo" }); assert.equal(redone.error, undefined);
  assert.equal(redone.content.paragraphs.find(p => p.paragraph === target.paragraph).automaticNumberPrefixes.length, 1);
  assert.deepEqual((await h.send({ kind: "save" })).bytes, saved.bytes);
});
