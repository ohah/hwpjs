import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

test("all chart numeric input paragraphs save reopen and preserve history", async t => {
  const path = "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", input = readFileSync(path);
  const inventory = JSON.parse(execFileSync("python3", ["tools/hwpx-formula-fixture-oracle.py", "--structure-inventory", path], { encoding: "utf8" }));
  const targets = inventory.protected.filter(row => !row.result);
  assert.equal(targets.length, 48);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    for (const target of targets) {
      editor.open(input); editor.enableHistory();
      assert.equal(editor.canEdit(0, target.paragraph), true);
      editor.splice(0, target.paragraph, 0, target.text.length, "0");
      const saved = editor.save();
      const request = JSON.stringify({ after: Buffer.from(saved).toString("base64"), paragraph: target.paragraph, value: "0" });
      for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-numeric-arithmetic-oracle.py"], { input: request, timeout: 30000 });
      if (target === targets[0]) for (const flags of [[], ["-O"]]) {
        const selfTest = JSON.parse(execFileSync("python3", [...flags, "tools/hwpx-numeric-arithmetic-oracle.py", "--self-test"], { input: request, timeout: 30000 }));
        assert.equal(selfTest.rejectedMutants, 7);
      }
      if (target === targets[0]) for (const flags of [[], ["-O"]]) assert.throws(() => execFileSync("python3", [...flags, "tools/hwpx-numeric-arithmetic-oracle.py"], {
        input: JSON.stringify({ after: Buffer.from(saved).toString("base64"), paragraph: target.paragraph, value: "wrong" }), timeout: 30000,
      }), /numeric input mismatch/);
      assert.equal(editor.paragraphTextSnapshot(0)[target.paragraph - 1].text, "0");
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
      assert.throws(() => editor.splice(0, target.paragraph, 0, target.text.length, "bad"), { message: "InvalidFormulaNumber" });
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true); assert.deepEqual(editor.save(), saved);
      editor.open(saved);
      assert.equal(editor.paragraphTextSnapshot(0)[target.paragraph - 1].text, "0");
      assert.deepEqual(editor.save(), saved);
    }
    t.diagnostic("48 numeric inputs edited; all 13 cached/displayed formulas independently checked with explicit 1e-5 relative tolerance");
  } finally { editor.close(); }
});
