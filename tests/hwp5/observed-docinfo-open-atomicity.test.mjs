import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemory } from "../../js/wasm-memory.mjs";

test("failed observed DocInfo ABI opens keep the active text history diagnostics and save baseline", { skip: !process.env.HWPJS_TEST_WASM }, async () => {
  const module = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));
  const { exports: wasm } = await WebAssembly.instantiate(module, {}), memory = createMemory(wasm);
  const source = readFileSync("reference/rhwp/samples/20250130-hongbo_saved.hwp");
  const output = action => {
    try {
      assert.equal(action(), 1, memory.error().message);
      return memory.copy(wasm.hwp5_edit_output_ptr(), wasm.hwp5_edit_output_len());
    } finally { wasm.hwp5_edit_output_free(); }
  };
  const diagnostics = () => JSON.parse(new TextDecoder().decode(output(() => wasm.hwp5_edit_observed_docinfo_diagnostics())));
  try {
    assert.equal(memory.withBytes(source, (ptr, size) => wasm.hwp5_edit_open_observed_docinfo(ptr, size, 1)), 1);
    assert.equal(wasm.hwp5_edit_history_enable(8, 8 * 1024 * 1024), 1);
    const original = output(() => wasm.hwp5_edit_copy_text(0, 2)), baseline = output(() => wasm.hwp5_edit_save(0));
    const before = diagnostics();
    const marker = new TextEncoder().encode("원자😀");
    assert.equal(memory.withBytes(marker, (ptr, size) => wasm.hwp5_edit_splice(0, 2, 0, 0, ptr, size, 0)), 1);
    const edited = output(() => wasm.hwp5_edit_copy_text(0, 2)), saved = output(() => wasm.hwp5_edit_save(1));
    assert.equal(wasm.hwp5_edit_history_revision(), 1);
    for (const [bytes, normalize] of [[source, 2], [new Uint8Array([0, 1]), 0]]) {
      assert.equal(memory.withBytes(bytes, (ptr, size) => wasm.hwp5_edit_open_observed_docinfo(ptr, size, normalize)), 0);
      assert.ok(memory.error().message.length > 0);
      assert.equal(wasm.hwp5_edit_history_revision(), 1);
      assert.deepEqual(output(() => wasm.hwp5_edit_copy_text(0, 2)), edited);
      assert.deepEqual(output(() => wasm.hwp5_edit_save(1)), saved);
      assert.deepEqual(diagnostics(), before);
    }
    assert.equal(wasm.hwp5_edit_undo(), 1);
    assert.deepEqual(output(() => wasm.hwp5_edit_copy_text(0, 2)), original);
    assert.deepEqual(output(() => wasm.hwp5_edit_save(0)), baseline);
    assert.equal(wasm.hwp5_edit_redo(), 1);
    assert.deepEqual(output(() => wasm.hwp5_edit_save(1)), saved);
  } finally { wasm.hwp5_edit_close(); }
  assert.equal(wasm.hwp5_edit_observed_docinfo_diagnostics(), 0);
  assert.equal(memory.error().message, "EditorNotOpen");
});
