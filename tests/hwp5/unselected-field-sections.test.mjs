import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, paragraphRecords, verifyRaw } from "./style-preservation/text-record-oracle.mjs";
import { expectedCharacterFormat } from "./style-preservation/character-format-record-oracle.mjs";
import { verifyCharacterProperties } from "./style-preservation/character-property-oracle.mjs";

test("fourteen-section original retains unselected click fields through text format properties and history", async () => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  const path = "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwp";
  const input = readFileSync(path), original = inspect(input);
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    assert.equal(editor.sectionCount(), 14);
    for (let section = 0; section < 14; section++) {
      editor.splice({ section, paragraph: 0, startUnit: 0, endUnit: 0, text: "검증😀" });
      const prefix = editor.save({ allowStaleLayout: true });
      verifyRaw(input, prefix.bytes, section, 0, 0, 0, "검증😀");
      const prefixed = inspect(prefix.bytes);
      const owner = paragraphRecords(prefixed.sections[section].bytes, 0);
      const run = owner.direct.find(r => r.tag === 68 && r.level === owner.head.level + 1);
      const charShapeId = (run.payload.readUInt32LE(4) + 1) % editor.characterShapeCount();
      assert.notEqual(charShapeId, run.payload.readUInt32LE(4));
      editor.setCharacterFormat({ section, paragraph: 0, startUnit: 0, endUnit: 2, charShapeId });
      const formatted = editor.save({ allowStaleLayout: true }), formatView = inspect(formatted.bytes);
      assert.deepEqual(formatView.sections[section].bytes, expectedCharacterFormat(prefixed.sections[section].bytes, 0, 0, 2, charShapeId));
      for (const [name, bytes] of prefixed.streams) if (name !== prefixed.sections[section].path) assert.deepEqual(formatView.streams.get(name), bytes);
      const request = { section, paragraph: 0, startUnit: 0, endUnit: 2, properties: { size: 1371, bold: true, italic: true } };
      editor.setCharacterProperties(request);
      const properties = editor.save({ allowStaleLayout: true });
      verifyCharacterProperties(formatted.bytes, properties.bytes, request);
      assert.deepEqual(inspect(properties.bytes).metadata, original.metadata);
      const reopened = await createExperimentalHwp5Editor(wasm, properties.bytes);
      try { assert.equal(reopened.text(section, 0), editor.text(section, 0)); }
      finally { reopened.close(); }
      for (const expected of [formatted, prefix]) {
        assert.equal(editor.undo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }), expected);
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      for (const expected of [prefix, formatted, properties]) {
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }), expected);
      }
      for (let index = 0; index < 3; index++) assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    }
  } finally { editor.close(); }
  assert.deepEqual(readFileSync(path), input);
});
