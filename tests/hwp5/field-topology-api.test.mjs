import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { withoutNormalizationExport } from "./normalization-export-fixture.mjs";
assert(process.env.HWPJS_TEST_WASM, "Explicit field-topology candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
const semantic = rows => rows.map(({ source_node, ...row }) => row);

test("actual unclosed field topology is queryable without granting strict editing", async () => {
  const path = "reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp", input = readFileSync(path);
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    assert.equal(editor.supportsFieldTopology(), true);
    const report = editor.fieldTopology(0);
    assert.equal(report.spans.length, 28);
    assert.deepEqual(report.unresolved, [{ kind: "unclosed_start", position: { paragraph: 52, unit: 8 }, marker_id: 0x25636c6b, ordinal: 0, list_node: 236 }]);
    assert.deepEqual(editor.fieldTopology(0), report);
    assert.throws(() => editor.fieldSpans(0), /UnsupportedCrossParagraphField/);
    assert.throws(() => editor.validateTextSourcePolicy(0), /UnsupportedCrossParagraphField/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false); assert.equal(editor.redo(), false);
    for (const section of [-1, NaN, Infinity, 0.5, 2 ** 32, "0"]) assert.throws(() => editor.fieldTopology(section), /Invalid section/);
    assert.throws(() => editor.fieldTopology(editor.sectionCount()), /InvalidSection/);
    assert.deepEqual(editor.fieldTopology(0), report);
  } finally { editor.close(); }
  assert.throws(() => editor.fieldTopology(0), /EditorClosed/);
  assert.throws(() => editor.supportsFieldTopology(), /EditorClosed/);
  assert.deepEqual(readFileSync(path), input);
});

test("field topology follows current coordinates and preserves pending redo and saved reopen", async () => {
  const input = readFileSync("reference/rhwp/samples/추진일정.hwp"), editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    const before = editor.fieldTopology(0);
    assert.deepEqual(before, { spans: semantic(editor.fieldSpans(0)), unresolved: [] });
    editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: "위치😀" });
    const after = editor.fieldTopology(0);
    assert.deepEqual(after, { spans: semantic(editor.fieldSpans(0)), unresolved: [] });
    assert.equal(after.spans[0].begin.unit, before.spans[0].begin.unit + 4);
    const saved = editor.save({ allowStaleLayout: true }).bytes;
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.fieldTopology(0), before);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.fieldTopology(0), after);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    const reopened = await createExperimentalHwp5Editor(wasm, saved);
    try { assert.deepEqual(reopened.fieldTopology(0), after); } finally { reopened.close(); }
  } finally { editor.close(); }
});

test("missing optional topology ABI preserves existing editing and pending redo", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  const editor = await createExperimentalHwp5Editor(withoutNormalizationExport(wasm, "hwp5_edit_field_topology"), input);
  try {
    editor.enableHistory();
    assert.equal(editor.supportsFieldTopology(), false);
    editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: "이력😀" });
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.fieldTopology(0), /Hwp5FieldTopologyAbiUnavailable/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true);
  } finally { editor.close(); }
});
