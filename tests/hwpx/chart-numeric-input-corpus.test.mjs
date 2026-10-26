import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { executeOracle } from "../../tools/oracle-process-async.mjs";

for (const [path, count] of [
  ["legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", 48],
  ["reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx", 12],
])
  test(`all ${count} numeric inputs retain independent SUM AVG caches history and reopen: ${path}`, async (t) => {
    if (path.startsWith("reference/") && !existsSync(path))
      return t.skip("reference fixture not present");
    assert(process.env.HWPJS_TEST_WASM, "ExplicitNumericCandidateRequired");
    const input = readFileSync(path);
    const hash = (b) => createHash("sha256").update(b).digest("hex"),
      inputHash = hash(input);
    const inventory = JSON.parse(
      await executeOracle(
        "python3",
        ["tools/hwpx-formula-fixture-oracle.py", "--structure-inventory", path],
        { encoding: "utf8", timeout: 30000 },
      ),
    );
    const targets = inventory.protected.filter((row) => !row.result);
    assert.equal(targets.length, count);
    assert.equal(new Set(targets.map((row) => row.paragraph)).size, count);
    const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
    let completed = 0;
    try {
      for (const target of targets) {
        editor.open(input);
        editor.enableHistory();
        assert.equal(editor.canEdit(0, target.paragraph), true);
        const row = editor
          .paragraphTextSnapshot(0)
          .find((row) => row.paragraph === target.paragraph);
        assert.equal(row.text, target.text);
        editor.splice(0, target.paragraph, 0, row.text.length, "1");
        const saved = Buffer.from(editor.save());
        assert.notDeepEqual(saved, input);
        const request = {
          before: input.toString("base64"),
          after: saved.toString("base64"),
          paragraph: target.paragraph,
          text: "1",
          selfTest: completed === 0,
        };
        for (const flags of [[], ["-O"]]) {
          const result = await executeOracle(
            "python3",
            [...flags, "tools/hwpx-chart-numeric-input-oracle.py"],
            { input: JSON.stringify(request), encoding: "utf8", timeout: 30000 },
          );
          if (completed === 0) assert.match(result, /8 mutations rejected/);
        }
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save()), input);
        const revision = editor.historyRevision();
        assert.throws(() => editor.splice(0, target.paragraph, 0, 0, "검증"), {
          message: "InvalidFormulaNumber",
        });
        assert.equal(editor.historyRevision(), revision);
        assert.deepEqual(Buffer.from(editor.save()), input);
        assert.equal(editor.redo(), true);
        assert.deepEqual(Buffer.from(editor.save()), saved);
        editor.open(saved);
        assert.equal(
          editor.paragraphTextSnapshot(0).find((row) => row.paragraph === target.paragraph).text,
          "1",
        );
        assert.deepEqual(Buffer.from(editor.save()), saved);
        completed++;
      }
      assert.equal(completed, count);
      assert.equal(hash(readFileSync(path)), inputHash);
    } finally {
      editor.close();
    }
  });
