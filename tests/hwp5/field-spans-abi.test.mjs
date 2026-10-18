import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { withoutNormalizationExport } from "./normalization-export-fixture.mjs";
import { inspect } from "./style-preservation/text-record-oracle.mjs";
import { independentFieldSpans } from "./field-span-oracle.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit field-span candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);

test("missing optional field-span ABI preserves text editing and pending redo", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  const editor = await createExperimentalHwp5Editor(withoutNormalizationExport(wasm, "hwp5_edit_field_spans"), input);
  try {
    editor.enableHistory();
    editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: "선택😀" });
    const saved = editor.save({ allowStaleLayout: true }).bytes;
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.fieldSpans(0), /Hwp5FieldSpansAbiUnavailable/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
  } finally { editor.close(); }
  assert.throws(() => editor.fieldSpans(0), /EditorClosed/);
});

test("current picture-number spans match independent records in all seven sections", async () => {
  const input = readFileSync("reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
    let count = 0, referenceCount = 0;
    for (let section = 0; section < 7; section++) {
      const original = editor.fieldSpans(section);
      const bytes = editor.save({ allowStaleLayout: true }).bytes;
      assert.deepEqual(original, independentFieldSpans(inspect(bytes).sections[section].bytes));
      count += original.length;
      referenceCount += original.filter(row => row.field_id === 0x25787266).length;
      editor.splice({ section, paragraph: 0, startUnit: 0, endUnit: 0, text: "위치😀" });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      const semantic = rows => rows.map(({ source_node, ...row }) => row);
      assert.deepEqual(semantic(editor.fieldSpans(section)), semantic(independentFieldSpans(inspect(saved).sections[section].bytes)));
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.fieldSpans(section), original);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    }
    assert.equal(count, 21);
    assert.equal(referenceCount, 18);
  } finally { editor.close(); }
});
