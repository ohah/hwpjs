import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records, paragraphRecords, verifyRaw } from "./style-preservation/text-record-oracle.mjs";
import { verifyCharacterProperties } from "./style-preservation/character-property-oracle.mjs";
import { independentFieldSpans } from "./field-span-oracle.mjs";
import { changeFirstObjectNumber } from "./object-reference-derivative.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit object-number candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);

test("actual mixed table and picture number references retain every section during text edits", async () => {
  const path = "reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp", input = readFileSync(path);
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    assert.equal(editor.sectionCount(), 7);
    const commands = inspect(input).sections.flatMap(section => records(section.bytes).filter(row => row.tag === 71 && row.payload.length >= 11 && row.payload.readUInt32LE(0) === 0x25787266).map(row => row.payload.subarray(11, 11 + row.payload.readUInt16LE(9) * 2).toString("utf16le")));
    assert.equal(commands.length, 18);
    assert(commands.some(text => /^\?#\d+;1;1;/.test(text)), "Actual picture-number fields required");
    assert(commands.some(text => /^\?#\d+;0;1;/.test(text)), "Actual table-number fields required");
    editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
    for (let section = 0; section < 7; section++) {
      editor.validateTextSourcePolicy(section);
      const baseline = editor.save({ allowStaleLayout: true }).bytes, before = inspect(baseline);
      const text = `구역${section}😀`, old = editor.text(section, 0);
      editor.splice({ section, paragraph: 0, startUnit: 0, endUnit: 0, text });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(baseline, saved, section, 0, 0, 0, text, { fieldIds: [0x25787266] });
      assert.deepEqual(inspect(saved).metadata, before.metadata);
      assert.equal(editor.text(section, 0), text + old);
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, baseline);
      for (const span of independentFieldSpans(before.sections[section].bytes).filter(row => row.field_id === 0x25787266)) {
        for (const position of [span.begin, span.end]) {
          assert.throws(() => editor.splice({ section, paragraph: position.paragraph, startUnit: position.unit, endUnit: position.unit, text: "거부" }), /ReadOnlyCrossReferenceResult/);
          assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, baseline);
        }
      }
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    }
    const saved = editor.save({ allowStaleLayout: true }).bytes, reopened = await createExperimentalHwp5Editor(wasm, saved);
    try { for (let section = 0; section < 7; section++) assert.equal(reopened.text(section, 0), editor.text(section, 0)); }
    finally { reopened.close(); }
    assert.deepEqual(readFileSync(path), input);
  } finally { editor.close(); }
});

test("actual page references do not inherit object-number retention", async () => {
  const input = readFileSync("reference/rhwp/samples/pic-in-head-01.hwp"), editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    assert.throws(() => editor.validateTextSourcePolicy(0), /UnsupportedSectionControl/);
    assert.throws(() => editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: "거부" }), /UnsupportedSectionControl/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false); assert.equal(editor.redo(), false);
  } finally { editor.close(); }
});

test("actual picture-reference text formatting preserves every record at beginning middle and end", async () => {
  const path = "reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp", input = readFileSync(path);
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
    const text = editor.text(0, 5), source = inspect(input);
    assert(text.length >= 4);
    assert.equal(text.charCodeAt(text.length - 1), 13, "Raw paragraph terminator is not editable text");
    assert.throws(() => editor.setCharacterProperties({ section: 0, paragraph: 5, startUnit: text.length - 1, endUnit: text.length, properties: { bold: true } }), /InvalidTextPosition/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    const owner = paragraphRecords(source.sections[0].bytes, 5);
    const runs = owner.direct.find(row => row.tag === 68).payload;
    const shapes = records(source.decode(source.streams.get("DocInfo"))).filter(row => row.tag === 21);
    for (const startUnit of [0, Math.floor((text.length - 1) / 2), text.length - 2]) {
      let shapeId;
      for (let at = 0; at < runs.length; at += 8) if (runs.readUInt32LE(at) <= startUnit) shapeId = runs.readUInt32LE(at + 4);
      assert.notEqual(shapeId, undefined);
      const bold = !(shapes[shapeId].payload.readUInt32LE(46) & 2);
      const request = { section: 0, paragraph: 5, startUnit, endUnit: startUnit + 1, properties: { bold } };
      editor.setCharacterProperties(request);
      const saved = Buffer.from(editor.save({ allowStaleLayout: true }).bytes);
      assert.notDeepEqual(saved, input);
      assert.equal(verifyCharacterProperties(input, saved, request), true);
      assert.throws(() => verifyCharacterProperties(input, saved, { ...request, properties: { bold: !bold } }), assert.AssertionError);
      assert.deepEqual(inspect(saved).metadata, source.metadata);
      assert.equal(editor.text(0, 5), text);
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try { assert.deepEqual(Buffer.from(reopened.save().bytes), saved); }
      finally { reopened.close(); }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save({ allowStaleLayout: true }).bytes), saved);
      assert.equal(editor.undo(), true);
    }
    assert.deepEqual(readFileSync(path), input);
  } finally { editor.close(); }
});

function slot(text, index, value) {
  const parts = text.split(";"); parts[index] = String(value); return parts.join(";");
}
for (const [name, change] of [
  ["external document", text => "not-opened.hwp" + text],
  ["page", text => slot(text, 2, 0)],
  ["text", text => slot(text, 2, 2)],
  ["relative position", text => slot(text, 2, 3)],
  ["note index", text => slot(text, 1, 3)],
]) test(`picture-number ${name} counter-control preserves bytes and prior redo`, async () => {
  const original = readFileSync("reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp");
  const input = await changeFirstObjectNumber(wasm, original, change), editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
    const count = editor.paragraphShapeCount(), old = editor.paragraphShapeId(0, 0);
    assert(count > 1);
    editor.setParagraphFormat({ section: 0, paragraph: 0, paraShapeId: (old + 1) % count });
    const formatted = editor.save({ allowStaleLayout: true }).bytes;
    assert.equal(editor.undo(), true);
    for (const section of [0, 1, 5, 6]) {
      assert.throws(() => editor.validateTextSourcePolicy(section), /UnsupportedSectionControl/);
      assert.throws(() => editor.splice({ section, paragraph: 0, startUnit: 0, endUnit: 0, text: "거부" }), /UnsupportedSectionControl/);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    }
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, formatted);
  } finally { editor.close(); }
});
