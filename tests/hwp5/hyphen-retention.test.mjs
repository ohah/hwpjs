import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, paragraphRecords, expectedSection } from "./style-preservation/text-record-oracle.mjs";

test("original hyphen paragraph preserves control bytes through edge edits and history", async () => {
  const input = readFileSync("reference/rhwp/samples/HWP5-nopassword-123456.hwp");
  const before = inspect(input);
  const paragraph = 5;
  const source = paragraphRecords(before.sections[0].bytes, paragraph);
  const text = source.direct.find(record => record.tag === 67).payload;
  assert.equal(text.readUInt16LE(90 * 2), 24);
  assert.equal(text.readUInt16LE(4 * 2), 31);
  assert.equal(source.head.payload.readUInt32LE(4), 0x81000000);
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    for (const unit of [0, 90, 91]) {
      editor.splice({ section: 0, paragraph, startUnit: unit, endUnit: unit, text: "검증😀" });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      const after = inspect(saved);
      assert.deepEqual(after.sections[0].bytes, expectedSection(before.sections[0].bytes, paragraph, unit, unit, "검증😀"));
      assert.deepEqual(after.metadata, before.metadata);
      assert.deepEqual([...after.streams.keys()].sort(), [...before.streams.keys()].sort());
      for (const [path, bytes] of before.streams)
        if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), bytes, path);
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try {
        assert.deepEqual(Buffer.from(reopened.copyText(0, paragraph)), Buffer.from(editor.copyText(0, paragraph)));
      } finally { reopened.close(); }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.throws(() => editor.splice({ section: 0, paragraph, startUnit: 90, endUnit: 91, text: "" }), /UnsupportedControlDeletion/);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      assert.equal(editor.undo(), true);
    }
  } finally { editor.close(); }
});
