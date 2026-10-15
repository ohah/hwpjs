import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { createCfbReader } from "../../js/cfb.mjs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, paragraphRecords, encodeRecord, verifyRaw } from "./style-preservation/text-record-oracle.mjs";

test("derived empty range marker survives disjoint input and current-boundary refusal preserves redo", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  const source = inspect(input), section = source.sections[0];
  const owner = paragraphRecords(section.bytes, 1);
  const text = owner.direct.find(r => r.tag === 67).payload;
  assert.equal(owner.direct.filter(r => r.tag === 70).length, 0);
  const point = text.length / 2 - 1;
  assert(point > 0);
  assert.equal(text.readUInt16LE(point * 2), 13);
  const marker = Buffer.alloc(12);
  marker.writeUInt32LE(point, 0); marker.writeUInt32LE(point, 4); marker.writeUInt32LE(0x0100000e, 8);
  const header = Buffer.from(owner.head.payload); header.writeUInt16LE(1, 14);
  const changed = Buffer.concat([
    ...owner.all.slice(0, owner.at).map(r => r.raw), encodeRecord(66, owner.head.level, header),
    ...owner.direct.map(r => r.raw), encodeRecord(70, owner.head.level + 1, marker),
    ...owner.all.slice(owner.end).map(r => r.raw),
  ]);
  const cfb = await createCfbReader(wasm);
  let derived;
  try {
    cfb.parse(input, { strict: true });
    const document = cfb.document();
    const node = document.nodes.find(n => n.kind === 2 && n.name === "Section0");
    assert(node); node.content = source.compressed ? deflateRawSync(changed) : changed;
    derived = cfb.write(document);
  } finally { cfb.close(); }
  const editor = await createExperimentalHwp5Editor(wasm, derived);
  try {
    editor.enableHistory();
    for (const atUnit of [0, point]) {
      assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit }), /UnsupportedRangeSemantics/);
      assert.deepEqual(editor.save().bytes, derived);
      assert.equal(editor.undo(), false);
    }
    editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "한😀" });
    const saved = editor.save({ allowStaleLayout: true }).bytes;
    assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 0 }), /UnsupportedRangeSemantics/);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    verifyRaw(derived, saved, 0, 1, 0, 0, "한😀", { preserveEmptyRanges: true });
    assert.throws(() => verifyRaw(derived, saved, 0, 1, 0, 0, "한😀"), /complete Section must match/);
    const reopened = await createExperimentalHwp5Editor(wasm, saved);
    try { assert.equal(reopened.text(0, 1), editor.text(0, 1)); }
    finally { reopened.close(); }
    assert.throws(() => editor.splice({ section: 0, paragraph: 1, startUnit: point + 3, endUnit: point + 3, text: "접촉" }), /UnsupportedRangeSemantics/);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.save().bytes, derived);
    assert.throws(() => editor.splice({ section: 0, paragraph: 1, startUnit: point, endUnit: point, text: "접촉" }), /UnsupportedRangeSemantics/);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
  } finally { editor.close(); }
});
