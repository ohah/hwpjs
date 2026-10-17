import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createCfbReader } from "../../js/cfb.mjs";
import { inspect, records, encodeRecord, verifyRaw } from "./style-preservation/text-record-oracle.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit unselected-field candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
const path = "reference/rhwp/samples/hwpspec.hwp";
const options = { normalizeObservedCfb: true, distribution: true };

test("actual spec text splice preserves all unselected table-number fields and prior formatting", async t => {
  if (!existsSync(path)) { t.skip("Reference fixture unavailable"); return; }
  const input = readFileSync(path), editor = await createExperimentalHwp5Editor(wasm, input, options);
  try {
    for (const section of [0, 1, 4, 5]) editor.validateTextSourcePolicy(section);
    for (const section of [2, 3]) assert.throws(() => editor.validateTextSourcePolicy(section), /UnsupportedSectionControl/);
    const baseline = editor.save().bytes;
    editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
    // A previous permitted edit in an unselected section must not disappear.
    const count = editor.paragraphShapeCount(), old = editor.paragraphShapeId(2, 271);
    assert(count > 1);
    editor.setParagraphFormat({ section: 2, paragraph: 271, paraShapeId: (old + 1) % count });
    const formatted = editor.save({ allowStaleLayout: true }).bytes;
    const original = editor.text(0, 6);
    editor.splice({ section: 0, paragraph: 6, startUnit: 0, endUnit: 0, text: "참조보존😀" });
    const saved = editor.save({ allowStaleLayout: true }).bytes;
    verifyRaw(formatted, saved, 0, 6, 0, 0, "참조보존😀");
    assert.equal(editor.text(0, 6), "참조보존😀" + original);
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, formatted);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    const reopened = await createExperimentalHwp5Editor(wasm, saved, { distribution: true });
    try { assert.equal(reopened.text(0, 6), editor.text(0, 6)); } finally { reopened.close(); }
    assert.equal(editor.undo(), true); assert.equal(editor.undo(), true);
    assert.deepEqual(editor.save().bytes, baseline);
    assert.deepEqual(readFileSync(path), input);
  } finally { editor.close(); }
});

async function counterControl(command) {
  const input = readFileSync(path), before = inspect(input), cfb = await createCfbReader(wasm);
  try {
    cfb.parse(input);
    const doc = cfb.document(); doc.nodes[0].created = 0n;
    const header = doc.nodes.find(row => row.parent === 0 && row.name === "FileHeader");
    const flags = Buffer.from(header.content); flags.writeUInt32LE(flags.readUInt32LE(36) & ~4, 36); header.content = flags;
    let storage = doc.nodes.findIndex(row => row.parent === 0 && row.name === "BodyText");
    if (storage < 0) {
      storage = doc.nodes.findIndex(row => row.parent === 0 && row.name === "ViewText");
      assert(storage >= 0); doc.nodes[storage].name = "BodyText";
    }
    let changed = false;
    for (const [section, row] of before.sections.entries()) {
      const content = Buffer.concat(records(row.bytes).map(record => {
        if (changed || record.tag !== 71 || record.payload.readUInt32LE(0) !== 0x25787266) return record.raw;
        const oldUnits = record.payload.readUInt16LE(9), text = record.payload.subarray(11, 11 + oldUnits * 2).toString("utf16le");
        assert.match(text, /^\?#\d+;0;1;1;0;$/);
        const replacement = Buffer.from(command(text), "utf16le");
        const payload = Buffer.concat([record.payload.subarray(0, 11), replacement, record.payload.subarray(11 + oldUnits * 2)]);
        payload.writeUInt16LE(replacement.length / 2, 9);
        changed = true; return encodeRecord(record.tag, record.level, payload);
      }));
      const target = doc.nodes.find(row => row.parent === storage && row.name === "Section" + section);
      if (target) target.content = deflateRawSync(content);
      else doc.nodes.push({ name: "Section" + section, parent: storage, content: deflateRawSync(content) });
    }
    assert(changed);
    const output = cfb.write(doc); cfb.parse(output, { strict: true }); return output;
  } finally { cfb.close(); }
}

for (const [name, change] of [
  ["external document", text => "not-opened.hwp" + text],
  ["page result", text => text.replace(";0;1;1;0;", ";0;0;1;0;")],
  ["text result", text => text.replace(";0;1;1;0;", ";0;2;1;0;")],
  ["relative position", text => text.replace(";0;1;1;0;", ";0;3;1;0;")],
]) test(`unselected ${name} is not silently granted by local-number retention`, async t => {
  if (!existsSync(path)) { t.skip("Reference fixture unavailable"); return; }
  // A memory-only, explicitly unprotected BodyText counter-control. The real
  // distribution source is never converted or overwritten on disk.
  const input = await counterControl(change), editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
    const count = editor.paragraphShapeCount(), old = editor.paragraphShapeId(0, 6);
    assert(count > 1);
    editor.setParagraphFormat({ section: 0, paragraph: 6, paraShapeId: (old + 1) % count });
    const formatted = editor.save({ allowStaleLayout: true }).bytes;
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.validateTextSourcePolicy(0), /UnsupportedSectionControl/);
    assert.throws(() => editor.splice({ section: 0, paragraph: 6, startUnit: 0, endUnit: 0, text: "forbidden" }), /UnsupportedSectionControl/);
    assert.deepEqual(editor.save().bytes, input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, formatted);
  } finally { editor.close(); }
});
