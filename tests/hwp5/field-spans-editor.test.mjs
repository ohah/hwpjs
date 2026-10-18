import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, expectedSection, records } from "./style-preservation/text-record-oracle.mjs";
import { independentFieldSpans } from "./field-span-oracle.mjs";

test("actual bookmark field query follows current edits history and saved reopen", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("reference/rhwp/samples/추진일정.hwp"), before = inspect(input);
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    const original = editor.fieldSpans(0);
    assert.equal(original.length, 1);
    assert.equal(original[0].field_id, 0x25626d6b);
    assert.deepEqual(original[0].begin, { paragraph: 0, unit: 32 });
    assert.deepEqual(original[0].end, { paragraph: 0, unit: 39 });
    assert.deepEqual(editor.fieldSpans(0), original);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false);
    assert.throws(() => editor.fieldSpans(editor.sectionCount()), /InvalidSection/);
    const text = "범위😀";
    editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text });
    const changed = editor.fieldSpans(0);
    assert.deepEqual(changed, original.map(row => ({ ...row,
      begin: { ...row.begin, unit: row.begin.unit + text.length },
      end: { ...row.end, unit: row.end.unit + text.length } })));
    const saved = editor.save({ allowStaleLayout: true }).bytes, after = inspect(saved);
    const semantic = rows => rows.map(({ source_node, ...row }) => row);
    assert.deepEqual(semantic(changed), semantic(independentFieldSpans(after.sections[0].bytes)));
    assert.deepEqual(after.sections[0].bytes, expectedSection(before.sections[0].bytes, 0, 0, 0, text, { fieldIds: [0x25626d6b] }));
    for (const [path, bytes] of before.streams) if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), bytes, path);
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.fieldSpans(0), original);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.fieldSpans(0), changed);
    const reopened = await createExperimentalHwp5Editor(wasm, saved);
    try {
      const restored = reopened.fieldSpans(0);
      assert.deepEqual(semantic(restored), semantic(changed));
      assert.deepEqual(restored, independentFieldSpans(after.sections[0].bytes));
      for (const row of restored) {
        const record = [...records(after.sections[0].bytes)][row.source_node];
        assert.equal(record.tag, 71);
        assert.equal(record.payload.readUInt32LE(0), row.field_id);
      }
    } finally { reopened.close(); }
    assert.equal(editor.undo(), true);
    editor.splice({ section: 0, paragraph: 0, startUnit: 32, endUnit: 32, text: "속😀" });
    const inside = editor.fieldSpans(0), insideSaved = editor.save({ allowStaleLayout: true }).bytes;
    assert.deepEqual(inside[0].begin, original[0].begin);
    assert.equal(inside[0].end.unit, original[0].end.unit + 3);
    const insideSource = inspect(insideSaved);
    assert.deepEqual(semantic(inside), semantic(independentFieldSpans(insideSource.sections[0].bytes)));
    assert.deepEqual(insideSource.sections[0].bytes, expectedSection(before.sections[0].bytes, 0, 32, 32, "속😀", { fieldIds: [0x25626d6b] }));
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally { editor.close(); }
  assert.throws(() => editor.fieldSpans(0), /EditorClosed/);
});

test("actual mixed hyperlink spans query leaves source unchanged", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    const rows = editor.fieldSpans(0);
    assert.equal(rows.length, 2);
    assert(rows.every(row => row.field_id === 0x25686c6b));
    assert.deepEqual(editor.fieldSpans(0), rows);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally { editor.close(); }
});
