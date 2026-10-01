import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { inflateRawSync } from "node:zlib";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { rawParagraphTexts } from "../../tools/hwp5-preview-record-oracle.mjs";
import { createMemory } from "../../js/wasm-memory.mjs";
const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const fixture = name => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
const context = { module: { exports: {} }, require: createRequire(import.meta.url), Buffer, process };
runInNewContext(readFileSync("legacy/cfb.js", "utf8"), context);
function streams(bytes) {
  const cfb = context.module.exports.parse(bytes), out = new Map();
  cfb.FileIndex.forEach((entry, i) => { if (entry.type === 2) out.set(cfb.FullPaths[i].slice(cfb.FullPaths[0].length), Buffer.from(entry.content)); });
  return out;
}
function records(bytes) {
  const out = [];
  for (let at = 0; at < bytes.length;) {
    assert(at + 4 <= bytes.length);
    const beginning = at, bits = bytes.readUInt32LE(at); at += 4;
    let size = bits >>> 20;
    if (size === 4095) { assert(at + 4 <= bytes.length); size = bytes.readUInt32LE(at); at += 4; }
    assert(size <= bytes.length - at);
    out.push({ tag: bits & 1023, level: (bits >>> 10) & 1023, raw: bytes.subarray(beginning, at + size), payload: bytes.subarray(at, at + size) }); at += size;
  }
  return out;
}
function section(bytes) {
  const s = streams(bytes), data = s.get("BodyText/Section0");
  return s.get("FileHeader")[36] & 1 ? inflateRawSync(data) : data;
}
test("editor WASM owns independent sessions and preserves copied output after close", async () => {
  const source = fixture("charshape"), editor = await createExperimentalHwp5Editor(wasm, source), other = await createExperimentalHwp5Editor(wasm, source);
  try {
    assert.equal(editor.sectionCount(), 1); assert.equal(editor.paragraphCount(0), 7); assert(editor.characterShapeCount() > 1);
    const before = editor.text(0, 1), owned = editor.copyText(0, 1);
    assert.deepEqual(editor.save().bytes, new Uint8Array(source));
    source.fill(0); assert.equal(editor.text(0, 1), before);
    editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "한😀" });
    assert.equal(editor.text(0, 1), "한😀" + before); assert.equal(other.text(0, 1), before);
    assert.deepEqual(Buffer.from(owned), Buffer.from(before, "utf16le"));
    assert.throws(() => editor.save(), { message: "LayoutReflowRequired" });
    const saved = editor.save({ allowStaleLayout: true }); assert(saved.layoutRequiresReflow);
    assert.deepEqual(saved.bytes, editor.save({ allowStaleLayout: true }).bytes);
    const beforeStreams = streams(fixture("charshape")), afterStreams = streams(saved.bytes);
    assert.deepEqual([...beforeStreams.keys()].sort(), [...afterStreams.keys()].sort());
    for (const [path, data] of beforeStreams) if (path !== "BodyText/Section0") assert.deepEqual(afterStreams.get(path), data);
    const oldTexts = rawParagraphTexts(section(fixture("charshape"))), newTexts = rawParagraphTexts(section(saved.bytes));
    oldTexts.forEach((text, i) => assert.deepEqual(newTexts[i], i === 1 ? Buffer.from("한😀" + before, "utf16le") : text));
    editor.close(); editor.close(); assert.throws(() => editor.text(0, 1), { message: "EditorClosed" });
    const reopened = await createExperimentalHwp5Editor(wasm, saved.bytes);
    try { assert.equal(reopened.text(0, 1), "한😀" + before); } finally { reopened.close(); }
    saved.bytes.fill(0); assert.equal(other.text(0, 1), before);
  } finally { editor.close(); other.close(); }
});
test("editor validates numbers, Unicode, policy and atomic native errors", async () => {
  const editor = await createExperimentalHwp5Editor(wasm, fixture("charshape"));
  try {
    const edit = { section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "x" };
    const before = editor.text(0, 1);
    for (const bad of [NaN, Infinity, -1, 0x100000000, 1.5, "0"]) assert.throws(() => editor.splice({ ...edit, startUnit: bad }), RangeError);
    assert.throws(() => editor.splice({ ...edit, text: "\ud800" }), { message: "InvalidUnicodeEncoding" });
    assert.throws(() => editor.splice({ ...edit, rangePolicy: "guess" }), { message: "InvalidRangePolicy" });
    assert.throws(() => editor.splice({ ...edit, text: "\n" }), { message: "UnsupportedTextControl" });
    assert.throws(() => editor.paragraphCount(99), { message: "InvalidSection" });
    assert.throws(() => editor.copyText(0, 999), { message: "InvalidParagraph" });
    assert.throws(() => editor.setCharacterFormat({ section: 0, paragraph: 1, startUnit: 0, endUnit: 1, charShapeId: 0xffffffff }), { message: "InvalidResourceReference" });
    assert.throws(() => editor.save({ allowStaleLayout: "false" }), TypeError);
    assert.equal(editor.text(0, 1), before);
    editor.splice({ ...edit, text: "😀" });
    const saved = editor.save({ allowStaleLayout: true });
    assert.throws(() => editor.splice({ ...edit, startUnit: 1, endUnit: 1 }), { message: "SplitSurrogatePair" });
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved.bytes);
  } finally { editor.close(); }
});
test("editor character format updates ID boundaries without text or non-target changes", async () => {
  for (const name of ["charshape", "parashape", "linespacing", "facename", "underline-styles"]) {
    const bytes = fixture(name), editor = await createExperimentalHwp5Editor(wasm, bytes), reader = await createHwp5Reader(wasm);
    try {
      const preview = reader.readText(bytes), p = preview.sections[0].paragraphs.findIndex(p => p.parentNodeIndex === null && p.textPresent && p.text.length > 0 && p.tokens.every(t => t.type !== "control" || t.code === 13));
      assert(p >= 0);
      const before = editor.text(0, p), end = before.length - 1;
      editor.setCharacterFormat({ section: 0, paragraph: p, startUnit: 0, endUnit: end, charShapeId: 0 });
      assert.equal(editor.text(0, p), before);
      const saved = editor.save({ allowStaleLayout: true });
      const projected = reader.readText(saved.bytes);
      // Removing an invalid line cache shifts physical record-node indices;
      // compare content, not source offsets that are intentionally regenerated.
      preview.sections[0].paragraphs.forEach((old, i) => {
        assert.equal(projected.sections[0].paragraphs[i].text, old.text);
        assert.deepEqual(projected.sections[0].paragraphs[i].tokens, old.tokens);
      });
      const oldStreams = streams(bytes), newStreams = streams(saved.bytes);
      assert.deepEqual([...oldStreams.keys()].sort(), [...newStreams.keys()].sort());
      for (const [path, data] of oldStreams) if (path !== "BodyText/Section0") assert.deepEqual(newStreams.get(path), data);
      const normalize = bytes => {
        let owner = -1;
        return records(section(bytes)).flatMap(r => {
          if (r.tag === 66) owner++;
          if (owner === p && [66, 68, 69].includes(r.tag)) return [];
          return [{ owner, tag: r.tag, level: r.level, bytes: Buffer.from(owner === p ? r.payload : r.raw) }];
        });
      };
      assert.deepEqual(normalize(saved.bytes), normalize(bytes));
      const selected = input => { let owner = -1; return records(section(input)).filter(r => { if (r.tag === 66) owner++; return owner === p; }); };
      const old = selected(bytes), rs = selected(saved.bytes), oldHeader = old.find(r => r.tag === 66).payload, header = rs.find(r => r.tag === 66).payload;
      assert.equal(header.length, oldHeader.length);
      // Only run and invalidated line-cache counts may differ for formatting.
      header.forEach((byte, i) => { if (![12, 13, 16, 17].includes(i)) assert.equal(byte, oldHeader[i]); });
      assert.equal(header.readUInt16LE(16), 0); assert.equal(rs.filter(r => r.tag === 69).length, 0);
      const runs = rs.filter(r => r.tag === 68); assert.equal(runs.length, 1);
      assert.equal(runs[0].payload.length, header.readUInt16LE(12) * 8);
      assert.equal(runs[0].payload.readUInt32LE(0), 0);
      for (let unit = 0; unit < end; unit++) {
        let id;
        for (let at = 0; at < runs[0].payload.length; at += 8) if (runs[0].payload.readUInt32LE(at) <= unit) id = runs[0].payload.readUInt32LE(at + 4);
        assert.equal(id, 0);
      }
    } finally { editor.close(); reader.close(); }
  }
});
test("raw editing ABI refuses bad policies and preserves session on failed reopen", async () => {
  const { instance: { exports: w } } = await WebAssembly.instantiate(wasm, {}), memory = createMemory(w);
  assert.equal(w.hwp5_edit_section_count() >>> 0, 0xffffffff);
  assert.equal(memory.error().message, "EditorNotOpen");
  const open = bytes => memory.withBytes(bytes, (ptr, size) => w.hwp5_edit_open(ptr, size));
  assert.equal(open(fixture("charshape")), 1);
  assert.equal(w.hwp5_edit_copy_text(0, 1), 1);
  const before = memory.copy(w.hwp5_edit_output_ptr(), w.hwp5_edit_output_len());
  assert.equal(open(new Uint8Array([1, 2, 3])), 0);
  assert.equal(w.hwp5_edit_section_count(), 1);
  assert.equal(w.hwp5_edit_copy_text(0, 1), 1);
  assert.deepEqual(memory.copy(w.hwp5_edit_output_ptr(), w.hwp5_edit_output_len()), before);
  assert.equal(w.hwp5_edit_save(2), 0); assert.equal(memory.error().message, "InvalidSavePolicy");
  memory.withBytes(new Uint8Array([120]), (ptr, size) => {
    assert.equal(w.hwp5_edit_splice(0, 1, 0, 0, ptr, size, 2), 0);
    assert.equal(memory.error().message, "InvalidRangePolicy");
    assert.equal(w.hwp5_edit_splice(0, 1, 0, 0, ptr, size, 0), 1);
  });
  assert.equal(w.hwp5_edit_save(0), 0); assert.equal(memory.error().message, "LayoutReflowRequired");
  assert.equal(w.hwp5_edit_save(1), 1); assert.equal(w.hwp5_edit_reflow(), 1);
  w.hwp5_edit_output_free(); assert.equal(w.hwp5_edit_reflow(), 0); assert.equal(w.hwp5_edit_output_len(), 0);
  w.hwp5_edit_close(); w.hwp5_edit_close();
  assert.equal(w.hwp5_edit_copy_text(0, 1), 0); assert.equal(memory.error().message, "EditorNotOpen");
});
