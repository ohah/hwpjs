import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createdTableIdentity } from "../../js/created-table-identity.mjs";

test("created cell identity uses exact canonical unsigned 64 bit strings", () => {
  for (const value of ["1", "9007199254740993", "18446744073709551615"]) assert.equal(createdTableIdentity(value).toString(), value);
  for (const value of [1, 1n, "0", "01", "-1", "+1", "1 ", "1e3", "18446744073709551616", ""]) assert.throws(() => createdTableIdentity(value), /InvalidCreatedTableIdentity/);
});

test("created cell setter refuses source identities without modifying document or history", async () => {
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  const bytes = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx");
  try {
    editor.open(bytes); editor.enableHistory();
    for (const identity of ["1", "9007199254740993", "18446744073709551615"]) assert.throws(() => editor.setCreatedCellText(0, identity, 0, 0, "입력😀"), /InvalidCreatedTableIdentity/);
    assert.throws(() => editor.setCreatedCellText(99, "1", 0, 0, ""), /InvalidSectionIndex/);
    assert.throws(() => editor.setCreatedCellText(0, 1, 0, 0, ""), /InvalidCreatedTableIdentity/);
    assert.deepEqual(Buffer.from(editor.save()), bytes);
    assert.equal(editor.undo(), false); assert.equal(editor.redo(), false);
  } finally { editor.close(); }
});
