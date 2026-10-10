import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "../../tools/oracle-process.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

test("actual HWPX PRODUCT and explicit repeated references preserve XML and saved history", async () => {
  const original = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    for (const formula of ["=PRODUCT(B?:E?)", "=PRODUCT(B?,C?,B?)", "=SUM(B?,C?,B?)", "=AVG(B?,C?,B?)", "=SUM(B?)"]) {
      editor.open(original); editor.enableHistory();
      const row = editor.formulaSources(0)[0];
      editor.setFormulaDefinition(0, row.begin_element, formula);
      const saved = Buffer.from(editor.save());
      for (const flags of [[], ["-O"]]) {
        const result = spawnSync("python3", [...flags, "tools/hwpx-formula-definition-oracle.py"], {
          input: JSON.stringify({ before: original.toString("base64"), after: saved.toString("base64"), ordinal: 0, formula }), encoding: "utf8", timeout: 30000,
        });
        assert.equal(result.status, 0, String(result.error ?? result.stderr));
        if (formula.startsWith("=PRODUCT(")) {
          const wrong = spawnSync("python3", ["tests/hwpx/formula-result-mutation.py"], {
            input: JSON.stringify({ bytes: saved.toString("base64"), ordinal: 0, display: formula.includes(",") ? "276.64" : "67.5" }), encoding: "utf8", timeout: 30000,
          });
          assert.equal(wrong.status, 0, String(wrong.error ?? wrong.stderr));
          const rejected = spawnSync("python3", [...flags, "tools/hwpx-formula-definition-oracle.py"], {
            input: JSON.stringify({ before: original.toString("base64"), after: wrong.stdout.trim(), ordinal: 0, formula }), encoding: "utf8", timeout: 30000,
          });
          assert.equal(rejected.error, undefined);
          assert.equal(rejected.signal, null);
          assert.equal(rejected.status, 1);
          assert.match(rejected.stderr, /ValueError: general six-digit calculation/);
        }
      }
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), original);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.equal(editor.formulaSources(0)[0].values.formula, formula);
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
  } finally { editor.close(); }
});

test("all chart formula definitions edit with independent arithmetic XML and history", async t => {
  const original = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    editor.open(original);
    const rows = editor.formulaSources(0);
    assert.equal(rows.length, 13);
    for (const [ordinal, row] of rows.entries()) {
      editor.open(original); editor.enableHistory();
      const formula = row.values.formula.replace(/^=SUM/, "=TEMP").replace(/^=AVG/, "=SUM").replace(/^=TEMP/, "=AVG");
      editor.setFormulaDefinition(0, row.begin_element, formula);
      const saved = Buffer.from(editor.save());
      for (const flags of [[], ["-O"]]) {
        const oracle = spawnSync("python3", [...flags, "tools/hwpx-formula-definition-oracle.py"], { input: JSON.stringify({ before: original.toString("base64"), after: saved.toString("base64"), ordinal, formula }), encoding: "utf8", timeout: 30000 });
        assert.equal(oracle.status, 0, `${ordinal} ${flags.join(" ")}: ${oracle.error ?? oracle.stderr}`);
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), original);
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.equal(editor.formulaSources(0)[ordinal].values.formula, formula);
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    t.diagnostic(`13/13 actual formulas edited, independent numeric inputs and full XML/ZIP checked`);
  } finally { editor.close(); }
});
