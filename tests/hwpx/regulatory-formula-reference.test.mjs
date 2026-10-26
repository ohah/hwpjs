import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("all three regulatory formula definitions edit with independent numeric inputs and history", async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const path = "reference/rhwp/samples/issue3637/regulatory_impact_nested_table_escape.hwpx";
  const input = readFileSync(path);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input);
    const rows = editor.formulaSources(0);
    assert.equal(rows.length, 3);
    for (const [ordinal, row] of rows.entries()) {
      editor.open(input);
      editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
      const formula =
        ordinal === 1 ? "=SUM(G2,G3,G4,G5,G6,G7,G8,G9,G10,G11)" : "=AVG(B?,C?,D?,E?,F?,G?)";
      editor.setFormulaDefinition(0, row.begin_element, formula);
      const saved = Buffer.from(editor.save());
      for (const flags of [[], ["-O"]]) {
        const check = (expected) =>
          execFileSync("python3", [...flags, "tools/hwpx-formula-definition-oracle.py"], {
            input: JSON.stringify({
              before: input.toString("base64"),
              after: saved.toString("base64"),
              ordinal,
              formula: expected,
            }),
            timeout: 30000,
          });
        check(formula);
        assert.throws(
          () => check(formula.replace(/^=(SUM|AVG)/, "=MIN")),
          (error) => error.status === 1 && /ValueError: definition/.test(String(error.stderr)),
        );
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.equal(editor.formulaSources(0)[ordinal].values.formula, formula);
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    assert.deepEqual(readFileSync(path), input);
  } finally {
    editor.close();
  }
});
