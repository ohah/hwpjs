import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
import { independentFieldSpans } from "./field-span-oracle.mjs";

test("native field spans match independent CFB record/list markers for real mixed ownership", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  for (const path of [
    "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp",
    "reference/rhwp/samples/추진일정.hwp",
    "reference/rhwp/samples/issue1891/76076_regulatory_analysis.hwpx",
  ]) {
    const input = readFileSync(path),
      source = inspect(input),
      editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      for (const [section, row] of source.sections.entries())
        assert.deepEqual(
          editor.fieldSpans(section),
          independentFieldSpans(row.bytes),
          `${path}:${section}`,
        );
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally {
      editor.close();
    }
  }
});

test("independent field oracle rejects forged header and end identities", () => {
  const source = inspect(readFileSync("reference/rhwp/samples/추진일정.hwp")).sections[0].bytes;
  const spans = independentFieldSpans(source),
    all = records(source),
    header = all[spans[0].source_node];
  const forgedHeader = Buffer.from(source);
  forgedHeader.writeUInt32LE(0x25636c6b, header.start + header.raw.length - header.payload.length);
  assert.throws(() => independentFieldSpans(forgedHeader), /independent field header mismatch/);
  const text = all.find((row) => row.tag === 67),
    forgedEnd = Buffer.from(source);
  forgedEnd.writeUInt32LE(
    0xffffffff,
    text.start + text.raw.length - text.payload.length + 39 * 2 + 2,
  );
  assert.throws(() => independentFieldSpans(forgedEnd), /independent field end mismatch/);
});
