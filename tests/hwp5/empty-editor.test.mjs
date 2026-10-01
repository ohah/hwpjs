import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createCfbReader } from "../../js/cfb.mjs";
import { inspect, records, paragraphRecords, encodeRecord, verifyRaw } from "./style-preservation/text-record-oracle.mjs";
const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const fixture = name => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);

async function exercise(source, paragraph) {
  const editor = await createExperimentalHwp5Editor(wasm, source);
  try {
    assert.equal(editor.copyText(0, paragraph).length, 0, "raw absence remains observable before materialization");
    editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: "" });
    editor.setCharacterFormat({ section: 0, paragraph, startUnit: 0, endUnit: 0, charShapeId: 0 });
    assert.deepEqual(editor.save().bytes, new Uint8Array(source), "no-op cannot manufacture a record");
    assert.throws(() => editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: "\n" }), { message: "UnsupportedTextControl" });
    assert.deepEqual(editor.save().bytes, new Uint8Array(source));
    editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: "한😀" });
    assert.equal(editor.text(0, paragraph), "한😀\r");
    assert.throws(() => editor.save(), { message: "LayoutReflowRequired" });
    const first = editor.save({ allowStaleLayout: true }).bytes;
    verifyRaw(source, first, 0, paragraph, 0, 0, "한😀");
    editor.splice({ section: 0, paragraph, startUnit: 3, endUnit: 3, text: "끝" });
    const second = editor.save({ allowStaleLayout: true }).bytes;
    verifyRaw(first, second, 0, paragraph, 3, 3, "끝");
    editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 4, text: "" });
    const empty = editor.save({ allowStaleLayout: true }).bytes;
    verifyRaw(second, empty, 0, paragraph, 0, 4, "");
    assert.equal(editor.text(0, paragraph), "\r");
    const reopened = await createExperimentalHwp5Editor(wasm, empty);
    try { assert.equal(reopened.text(0, paragraph), "\r"); } finally { reopened.close(); }
    const p = paragraphRecords(inspect(second).sections[0].bytes, paragraph);
    assert.equal(p.direct.filter(r => r.tag === 67).length, 1, "repeated edits cannot duplicate PARA_TEXT");
  } finally { editor.close(); }
}

test("real omitted-text paragraphs preserve their style and support insert, repeat, delete and reopen", async t => {
  for (const name of ["table", "table2", "software", "example", "facename"]) await t.test(name, async () => {
    const source = fixture(name), raw = inspect(source).sections[0].bytes;
    const candidates = records(raw).filter(r => r.tag === 66).flatMap((header, i) => {
      const p = paragraphRecords(raw, i);
      return !p.direct.some(r => r.tag === 67) && header.payload.readUInt32LE(4) === 0 ? [i] : [];
    });
    assert(candidates.length);
    for (const p of new Set([candidates[0], candidates[Math.floor(candidates.length / 2)], candidates.at(-1)])) await exercise(source, p);
  });
});

async function changedParagraph(change) {
  const source = fixture("table"), raw = inspect(source).sections[0].bytes, p = paragraphRecords(raw, 1);
  const writer = await createCfbReader(wasm);
  try {
    writer.parse(source, { strict: true }); const doc = writer.document();
    const section = doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText");
    section.content = deflateRawSync(Buffer.concat([...p.all.slice(0, p.at).map(r => r.raw), ...change(p), ...p.all.slice(p.end).map(r => r.raw)]));
    return writer.write(doc);
  } finally { writer.close(); }
}

test("zero-count empty paragraphs work with omitted or explicit zero-length text records", async () => {
  for (const present of [false, true]) {
    const bytes = await changedParagraph(p => {
      const header = Buffer.from(p.head.payload); header.writeUInt32LE((header.readUInt32LE(0) & 0x80000000) >>> 0, 0);
      return [encodeRecord(66, p.head.level, header), ...(present ? [encodeRecord(67, p.head.level + 1, Buffer.alloc(0))] : []), ...p.direct.map(r => r.raw)];
    });
    await exercise(bytes, 1);
  }
});

test("missing nonempty text and missing style metadata cannot be silently fabricated", async () => {
  for (const [error, change] of [
    ["UnsupportedMissingText", p => { const h = Buffer.from(p.head.payload); h.writeUInt32LE(9, 0); return [encodeRecord(66, p.head.level, h), ...p.direct.map(r => r.raw)]; }],
    ["UnsupportedMissingCharacterRuns", p => { const h = Buffer.from(p.head.payload); h.writeUInt16LE(0, 12); return [encodeRecord(66, p.head.level, h), ...p.direct.filter(r => r.tag !== 68).map(r => r.raw)]; }],
  ]) {
    const bytes = await changedParagraph(change), editor = await createExperimentalHwp5Editor(wasm, bytes);
    try {
      assert.throws(() => editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "X" }), { message: error });
      assert.equal(editor.copyText(0, 1).length, 0);
      assert.deepEqual(editor.save().bytes, bytes);
    } finally { editor.close(); }
  }
});
