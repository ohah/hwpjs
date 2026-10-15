import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";

test("allowing unchanged click fields does not waive cross-section numeric reference protection", async () => {
  const input = readFileSync("reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp");
  const before = inspect(input);
  const referenceCount = section => records(section.bytes).filter(record => record.tag === 71 && record.payload.subarray(0, 4).equals(Buffer.from("frx%"))).length;
  assert.equal(before.sections.length, 7);
  assert.equal(referenceCount(before.sections[0]), 2);
  for (const section of [1, 5, 6]) assert.equal(referenceCount(before.sections[section]), 0);
  const editor = await createExperimentalHwp5Editor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"), input);
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
        assert.equal(editor.undo(), false); assert.equal(editor.redo(), false);
      }
    }
  } finally { editor.close(); }
});
