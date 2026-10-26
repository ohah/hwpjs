import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";

test("actual opaque drawing tails match independent offsets and remain read-only through edit history", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("reference/rhwp/samples/HWP5-nopassword-123456.hwp");
  const before = Buffer.from(input);
  const expected = records(inspect(input).sections[0].bytes).flatMap((record, control_node) => {
    if (record.tag !== 71 || record.payload.readUInt32LE(0) !== 0x67736f20) return [];
    const bytes = record.payload;
    const end = 46 + bytes.readUInt16LE(44) * 2;
    assert(end <= bytes.length);
    return [
      {
        control_node,
        extra_bytes: bytes.length - end,
        extra_hex: bytes.subarray(end).toString("hex"),
      },
    ];
  });
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    const rows = editor.drawingObjectExtras(0);
    assert.equal(rows.length, 30);
    assert.deepEqual(
      rows.map(({ paragraph_node: _serializationParagraphNode, ...row }) => row),
      expected,
    );
    assert(rows.every((row) => row.extra_bytes === 2 && row.extra_hex === "0000"));
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    editor.splice({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0, text: "조회😀" });
    const saved = editor.save({ allowStaleLayout: true }).bytes;
    assert.deepEqual(editor.drawingObjectExtras(0), rows);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    assert.throws(() => editor.drawingObjectExtras(999), /InvalidSection/);
    assert.deepEqual(editor.drawingObjectExtras(0), rows);
    assert.deepEqual(input, before);
  } finally {
    editor.close();
  }
});
