import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { executeOracle } from "../../tools/oracle-process-async.mjs";

test("all actual BELOW numeric inputs preserve percentage paragraphs literal suffix and other formulas", async () => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitNumericCandidateRequired");
  const path = "reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx";
  const input = readFileSync(path), digest = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest(input), "fa00fae4aec5f80175898734ea4d06b82f4c80df7e32b69a7370328c770ab60f");
  const oracle = "tools/hwpx-below-sum-input-oracle.py";
  const targets = JSON.parse(await executeOracle("python3", [oracle, "--inventory", path], { encoding: "utf8", timeout: 30000 }));
  assert.equal(targets.length, 50); assert.equal(new Set(targets.map(row => row.paragraph)).size, 50);
  assert.equal(targets.filter(row => row.note !== null).length, 42);
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM), wasmHash = digest(wasm);
  const editor = await createHwpxEditor(wasm), counts = [0, 0, 0, 0, 0], covered = new Set();
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
        assert.equal(result.inputs, 50); assert.equal(result.formulas, 5); assert.deepEqual(result.affected, [target.ordinal]);
        if (selfTest) {
          assert.equal(result.rejectedMutants, 10);
          const other = targets.find(row => row.ordinal !== target.ordinal);
          for (const [patch, message] of [
            [{ paragraph: other.paragraph }, /Complete BELOW SUM XML mismatch/],
            [{ paragraph: true }, /Explicit BELOW input/],
            [{ paragraph: 549 }, /Observed BELOW input identity/],
            [{ text: "0" }, /Explicit BELOW input/],
            [{ before: "" }, /Observed BELOW source bytes/],
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
    assert.deepEqual(counts, [8, 10, 10, 11, 11]);
    // One ordinary explanation in each numeric column must remain editable.
    for (const ordinal of [1, 2, 3, 4]) {
      const { note: paragraph } = targets.find(row => row.ordinal === ordinal);
      editor.open(input); editor.enableHistory();
      const original = editor.paragraphTextSnapshot(0).find(row => row.paragraph === paragraph).text;
      assert(original.startsWith("(")); assert.equal(editor.canEdit(0, paragraph), true);
      const text = "설명😀";
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
