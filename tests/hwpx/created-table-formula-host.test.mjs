import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("generated table outside formula cells retains independent calculation and rejects invalid saved semantics", async () => {
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  try {
    editor.open(source); editor.enableHistory();
    const resources = Object.fromEntries(Object.entries(editor.tableCreationResources()).map(([k, ids]) => [k, ids[0]]));
    const options = { rows: 1, columns: 1, width: 100, rowHeight: 17, resources };
    assert.throws(() => editor.insertTable(0, 20, 0, options), /UnsupportedFormulaCellContent/);
    assert.deepEqual(Buffer.from(editor.save()), source);
    assert.deepEqual(editor.createdTables(0), []);
    assert.equal(editor.undo(), false);
    editor.insertTable(0, 1, 0, options);
    const before = editor.save();
    editor.splice(0, 20, 0, 4, "100");
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "156.3");
    const after = editor.save();
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-structure-formula-oracle.py"], {
      input: JSON.stringify({ before: Buffer.from(before).toString("base64"), after: Buffer.from(after).toString("base64"), value: "100" }), timeout: 30000,
    });
    assert.equal(editor.undo(), true); assert.deepEqual(editor.save(), before);
    assert.throws(() => editor.insertTable(0, 20, 0, options), /UnsupportedFormulaCellContent/);
    assert.throws(() => editor.splice(0, 20, 0, 4, "bad"), /InvalidFormulaNumber/);
    assert.deepEqual(editor.save(), before);
    assert.equal(editor.redo(), true); assert.deepEqual(editor.save(), after);
    editor.open(after);
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "156.3");
    assert.deepEqual(editor.save(), after);
  } finally { editor.close(); }
});
