import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
import { changeFirstObjectNumber } from "./object-reference-derivative.mjs";

test("object-number retention does not waive cross-section page reference protection", async () => {
  const original = readFileSync(
    "reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp",
  );
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = await changeFirstObjectNumber(wasm, original, (text) =>
    text.replace(/;1;0;0;$/, ";0;0;0;"),
  );
  const before = inspect(input);
  const referenceCount = (section) =>
    records(section.bytes).filter(
      (record) => record.tag === 71 && record.payload.subarray(0, 4).equals(Buffer.from("frx%")),
    ).length;
  assert.equal(before.sections.length, 7);
  assert.equal(referenceCount(before.sections[0]), 2);
  for (const section of [1, 5, 6]) assert.equal(referenceCount(before.sections[section]), 0);
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    for (const section of [1, 5, 6]) {
      const position = { section, paragraph: 0, startUnit: 0, endUnit: 0 };
      for (const command of [
        () => editor.splice({ ...position, text: "거부검증😀" }),
        () => editor.setCharacterFormat({ ...position, charShapeId: 0 }),
        () => editor.setCharacterProperties({ ...position, properties: { size: 1700 } }),
      ]) {
        assert.throws(command, /UnsupportedSectionControl/);
        assert.deepEqual(Buffer.from(editor.save().bytes), input);
        assert.equal(editor.undo(), false);
        assert.equal(editor.redo(), false);
      }
    }
  } finally {
    editor.close();
  }
});
