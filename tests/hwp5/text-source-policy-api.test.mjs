import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
test("native text source policy queries preserve source save and history and keep supported input available", async () => {
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    assert.equal(editor.supportsTextSourcePolicy(), true);
    editor.validateTextSourcePolicy(0);
    for (const invalid of [-1, NaN, Infinity, 0.5, 2 ** 32, "0"]) assert.throws(() => editor.validateTextSourcePolicy(invalid), /Invalid section/);
    assert.throws(() => editor.validateTextSourcePolicy(editor.sectionCount()), /InvalidSection/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false); assert.equal(editor.redo(), false);
    editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "허가😀" });
    assert.equal(editor.undo(), true);
    editor.validateTextSourcePolicy(0);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true);
  } finally { editor.close(); }
  assert.throws(() => editor.validateTextSourcePolicy(0), /EditorClosed/);
});

test("text source policy optional ABI absence is explicit rather than a positive permission", async () => {
  const old = Buffer.from(wasm), name = "hwp5_edit_validate_text_source_policy";
  const at = old.indexOf(name);
  assert(at >= 0); old[at] = "x".charCodeAt(0);
  const module = new WebAssembly.Module(old);
  assert.equal(WebAssembly.Module.exports(module).some(row => row.name === name), false);
  const editor = await createExperimentalHwp5Editor(module, input);
  try {
    assert.equal(editor.supportsTextSourcePolicy(), false);
    assert.throws(() => editor.validateTextSourcePolicy(0), /Hwp5TextSourcePolicyAbiUnavailable/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally { editor.close(); }
});
