import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { executeOracle } from "../../tools/oracle-process-async.mjs";

test("all actual nested-table SUM and ABOVE inputs preserve other tables and history", async () => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitNumericCandidateRequired");
  const path = "reference/rhwp/samples/issue3637/regulatory_impact_nested_table_escape.hwpx";
  const input = readFileSync(path), digest = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest(input), "e7b147f7cea66c97bed79085a3d89c2656037e0f711232f659ed3c7344984f62");
  const oracle = "tools/hwpx-nested-sum-input-oracle.py";
  const targets = JSON.parse(await executeOracle("python3", [oracle, "--inventory", path], { encoding: "utf8", timeout: 30000 }));
  assert.equal(targets.length, 22); assert.equal(new Set(targets.map(row => row.paragraph)).size, 22);
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM), wasmHash = digest(wasm);
  const editor = await createHwpxEditor(wasm), counts = [0, 0, 0], covered = new Set();
  try {
    for (const target of targets) {
      editor.open(input); editor.enableHistory();
      assert.equal(editor.canEdit(0, target.paragraph), true);
      assert.equal(editor.paragraphTextSnapshot(0).find(row => row.paragraph === target.paragraph).text, target.text);
      editor.splice(0, target.paragraph, 0, target.text.length, "1");
      const saved = Buffer.from(editor.save()); assert(!saved.equals(input));
      const selfTest = !covered.has(target.ordinal);
      for (const flags of [[], ["-O"]]) {
        const request = { before: input.toString("base64"), after: saved.toString("base64"), paragraph: target.paragraph, text: "1", selfTest };
        const result = JSON.parse(await executeOracle("python3", [...flags, oracle], { input: JSON.stringify(request), encoding: "utf8", timeout: 30000 }));
        assert.equal(result.inputs, 22); assert.equal(result.formulas, 3);
        assert.deepEqual(result.affected, [target.ordinal]);
        if (selfTest) {
          assert.equal(result.rejectedMutants, 9);
          const other = targets.find(row => row.ordinal !== target.ordinal);
          for (const [patch, message] of [
            [{ paragraph: other.paragraph }, /Complete nested SUM XML mismatch/],
            [{ paragraph: true }, /Explicit nested SUM input/],
            [{ paragraph: 979 }, /Observed numeric input identity/],
            [{ text: "0" }, /Explicit nested SUM input/],
            [{ before: "" }, /Observed nested SUM source bytes/],
          ]) await assert.rejects(() => executeOracle("python3", [...flags, oracle], {
            input: JSON.stringify({ ...request, ...patch, selfTest: false }), encoding: "utf8", timeout: 30000,
          }), error => error.status === 1 && error.signal === null && message.test(String(error.stderr)));
        }
      }
      covered.add(target.ordinal); counts[target.ordinal]++;
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
      const revision = editor.historyRevision();
      assert.throws(() => editor.splice(0, target.paragraph, 0, 0, "bad"), { message: "InvalidFormulaNumber" });
      assert.equal(editor.historyRevision(), revision); assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.equal(editor.paragraphTextSnapshot(0).find(row => row.paragraph === target.paragraph).text, "1");
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    assert.deepEqual(counts, [6, 10, 6]);
    // Neither the nonnumeric stop header nor the value below ABOVE is an operand.
    for (const [paragraph, original] of [[891, "현재가치"], [892, "(E=C*D, 백만 원)"], [979, "2.48"]]) {
      editor.open(input); editor.enableHistory();
      assert.equal(editor.canEdit(0, paragraph), true);
      assert.equal(editor.paragraphTextSnapshot(0).find(row => row.paragraph === paragraph).text, original);
      const text = "검증😀";
      editor.splice(0, paragraph, 0, 0, text);
      const saved = Buffer.from(editor.save());
      for (const flags of [[], ["-O"]]) await executeOracle("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
        input: JSON.stringify({ before: input.toString("base64"), after: saved.toString("base64"), section: 0, paragraph, text }), encoding: "utf8", timeout: 30000,
      });
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.equal(editor.paragraphTextSnapshot(0).find(row => row.paragraph === paragraph).text, text + original);
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    assert.deepEqual(readFileSync(path), input);
  } finally {
    editor.close();
    assert.equal(digest(wasm), wasmHash, "candidate buffer changed during verification");
    assert.equal(digest(readFileSync(process.env.HWPJS_TEST_WASM)), wasmHash, "candidate file changed during verification");
  }
});
