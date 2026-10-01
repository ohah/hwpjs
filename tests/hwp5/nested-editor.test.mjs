import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createCfbReader } from "../../js/cfb.mjs";
import { inspect, records, paragraphRecords, encodeRecord, verifyRaw } from "./style-preservation/text-record-oracle.mjs";
const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/software.hwp");

test("nested software cell splices preserve the complete independent Section and every other stream", async () => {
  const raw = inspect(source).sections[0].bytes;
  const candidates = records(raw).filter(r => r.tag === 66).flatMap((r, i) => {
    const p = paragraphRecords(raw, i);
    return r.level > 0 && r.payload.readUInt32LE(4) === 0 && p.direct.some(r => r.tag === 67) ? [i] : [];
  });
  // Include the title and a distant cell; avoid repeating only the first cell.
  assert(candidates.includes(2));
  for (const paragraph of new Set([2, candidates[Math.floor(candidates.length / 2)], candidates.at(-1)])) {
    const text = paragraphRecords(raw, paragraph).direct.find(r => r.tag === 67).payload;
    const units = text.length / 2 - 1;
    for (const [start, end, addition] of [[0, 0, "한😀"], [units, units, "끝"], [0, units, ""]]) {
      const editor = await createExperimentalHwp5Editor(wasm, source);
      try {
        editor.splice({ section: 0, paragraph, startUnit: start, endUnit: end, text: addition });
        const output = editor.save({ allowStaleLayout: true });
        verifyRaw(source, output.bytes, 0, paragraph, start, end, addition);
        const reopened = await createExperimentalHwp5Editor(wasm, output.bytes);
        try { assert.deepEqual(reopened.copyText(0, paragraph), editor.copyText(0, paragraph)); }
        finally { reopened.close(); }
      } finally { editor.close(); }
    }
  }
});

test("nested list count mismatch is rejected atomically, not bypassed by display candidate", async () => {
  const writer = await createCfbReader(wasm);
  let damaged;
  try {
    writer.parse(source, { strict: true });
    const doc = writer.document(), raw = inspect(source).sections[0].bytes;
    const all = records(raw), title = paragraphRecords(raw, 2), list = all.slice(0, title.at).findLast(r => r.tag === 72);
    assert(list); const payload = Buffer.from(list.payload); payload.writeUInt16LE(payload.readUInt16LE(0) + 1, 0);
    const section = doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText");
    section.content = deflateRawSync(Buffer.concat(all.map(r => r === list ? encodeRecord(r.tag, r.level, payload) : r.raw)));
    damaged = writer.write(doc);
  } finally { writer.close(); }
  const editor = await createExperimentalHwp5Editor(wasm, damaged);
  try {
    const before = editor.copyText(0, 2);
    assert.throws(() => editor.splice({ section: 0, paragraph: 2, startUnit: 0, endUnit: 0, text: "X" }), { message: "ListParagraphCountMismatch" });
    assert.deepEqual(editor.copyText(0, 2), before);
    assert.deepEqual(editor.save().bytes, damaged);
  } finally { editor.close(); }
});

test("nested ownership rejects missing list/table and duplicate table markers without changing source", async t => {
  const raw = inspect(source).sections[0].bytes, all = records(raw), title = paragraphRecords(raw, 2);
  const list = all.slice(0, title.at).findLast(r => r.tag === 72), table = all.find(r => r.tag === 77);
  for (const [label, change, error] of [
    ["missing list", r => r === list ? [encodeRecord(73, r.level, r.payload)] : [r.raw], "OrphanListParagraph"],
    ["missing table", r => r === table ? [encodeRecord(73, r.level, r.payload)] : [r.raw], "MissingTableRecord"],
    ["duplicate table", r => r === table ? [r.raw, r.raw] : [r.raw], "DuplicateTableRecord"],
  ]) await t.test(label, async () => {
    const writer = await createCfbReader(wasm);
    let bytes;
    try {
      writer.parse(source, { strict: true }); const doc = writer.document();
      const section = doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText");
      section.content = deflateRawSync(Buffer.concat(all.flatMap(change))); bytes = writer.write(doc);
    } finally { writer.close(); }
    const editor = await createExperimentalHwp5Editor(wasm, bytes);
    try {
      assert.throws(() => editor.splice({ section: 0, paragraph: 2, startUnit: 0, endUnit: 0, text: "X" }), { message: error });
      assert.deepEqual(editor.save().bytes, bytes);
    } finally { editor.close(); }
  });
});

test("nested full-record oracle catches ignored edit and a change in a different cell", async () => {
  assert.throws(() => verifyRaw(source, source, 0, 2, 0, 0, "X"), /complete Section/);
  const editor = await createExperimentalHwp5Editor(wasm, source);
  try {
    editor.splice({ section: 0, paragraph: 4, startUnit: 0, endUnit: 0, text: "X" });
    assert.throws(() => verifyRaw(source, editor.save({ allowStaleLayout: true }).bytes, 0, 2, 0, 0, "X"), /complete Section/);
  } finally { editor.close(); }
});
