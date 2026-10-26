import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("all chart numeric input edits produce exact independently formatted formula strings", async () => {
  const path = "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx";
  const input = readFileSync(path);
  const inventory = JSON.parse(
    execFileSync(
      "python3",
      ["tools/hwpx-formula-fixture-oracle.py", "--structure-inventory", path],
      { encoding: "utf8", timeout: 30000 },
    ),
  );
  const targets = inventory.protected.filter((row) => !row.result);
  assert.equal(targets.length, 48);
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    for (const target of targets) {
      editor.open(input);
      editor.splice(0, target.paragraph, 0, target.text.length, "0");
      const saved = editor.save();
      const request = JSON.stringify({
        after: Buffer.from(saved).toString("base64"),
        paragraph: target.paragraph,
        value: "0",
      });
      for (const flags of [[], ["-O"]]) {
        const result = JSON.parse(
          execFileSync("python3", [...flags, "tools/hwpx-numeric-exact-oracle.py"], {
            input: request,
            encoding: "utf8",
            timeout: 30000,
          }),
        );
        assert.equal(result.formulas, 13);
        assert.equal(result.comparison, "exact formatted strings");
        if (target === targets[0]) {
          const negative = JSON.parse(
            execFileSync(
              "python3",
              [...flags, "tools/hwpx-numeric-exact-oracle.py", "--self-test"],
              { input: request, encoding: "utf8", timeout: 30000 },
            ),
          );
          assert.deepEqual(negative, { rejectedNearMutants: 1, toleranceOracleAccepted: true });
        }
      }
    }
  } finally {
    editor.close();
  }
});
