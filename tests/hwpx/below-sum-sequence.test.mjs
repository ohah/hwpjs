import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { executeOracle } from "../../tools/oracle-process-async.mjs";

test("successive BELOW edits retain both current inputs across undo redo branches and reopen", async () => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitNumericCandidateRequired");
  const path = "reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx", input = readFileSync(path);
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest(input), "fa00fae4aec5f80175898734ea4d06b82f4c80df7e32b69a7370328c770ab60f");
  const oracle = "tools/hwpx-below-sum-input-oracle.py";
  const targets = JSON.parse(await executeOracle("python3", [oracle, "--inventory", path], { encoding: "utf8", timeout: 30000 }));
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM), wasmHash = digest(wasm), editor = await createHwpxEditor(wasm);
  let sequences = 0;
  try {
    for (const pair of [[89, 95], [548, 550], [548, 710], [89, 712]]) for (const paragraphs of [pair, [...pair].reverse()]) {
      const selected = paragraphs.map(paragraph => { const target = targets.find(row => row.paragraph === paragraph); assert(target); return target; });
      editor.open(input); editor.enableHistory();
      const edits = [], saved = [input];
      for (const target of selected) {
        assert.equal(editor.paragraphTextSnapshot(0).find(row => row.paragraph === target.paragraph).text, target.text);
        editor.splice(0, target.paragraph, 0, target.text.length, "1");
        edits.push({ paragraph: target.paragraph, text: "1" });
        saved.push(Buffer.from(editor.save()));
        const affected = [...new Set(selected.slice(0, edits.length).map(row => row.ordinal))].sort((a, b) => a - b);
        for (const flags of [[], ["-O"]]) {
          const request = { before: input.toString("base64"), after: saved.at(-1).toString("base64"), edits };
          const result = JSON.parse(await executeOracle("python3", [...flags, oracle], { input: JSON.stringify(request), encoding: "utf8", timeout: 30000 }));
          assert.deepEqual(result, { inputs: 50, formulas: 5, affected });
          if (sequences === 0 && edits.length === 2) for (const [patch, message] of [
            [{ edits: edits.slice(0, 1) }, /Complete BELOW SUM XML mismatch/],
            [{ edits: [edits[0], edits[0]] }, /Distinct BELOW sequence inputs/],
            [{ edits: [] }, /Bounded BELOW sequence/],
            [{ edits: [...edits, edits[0]] }, /Bounded BELOW sequence/],
            [{ edits: [{ paragraph: true, text: "1" }] }, /Explicit BELOW input/],
            [{ paragraph: 89 }, /Ambiguous BELOW input shape/],
          ]) await assert.rejects(() => executeOracle("python3", [...flags, oracle], {
            input: JSON.stringify({ ...request, ...patch }), encoding: "utf8", timeout: 30000,
          }), error => error.status === 1 && error.signal === null && message.test(String(error.stderr)));
        }
      }
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), saved[1]);
      const revision = editor.historyRevision();
      assert.throws(() => editor.splice(0, selected[1].paragraph, 0, 0, "bad"), { message: "InvalidFormulaNumber" });
      assert.equal(editor.historyRevision(), revision); assert.deepEqual(Buffer.from(editor.save()), saved[1]);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved[2]);
      for (const index of [1, 0]) { assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), saved[index]); }
      for (const index of [1, 2]) { assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved[index]); }
      const oldRevision = editor.historyRevision();
      assert.equal(editor.undo(), true);
      editor.splice(0, selected[1].paragraph, 0, selected[1].text.length, "1");
      assert(editor.historyRevision() > oldRevision); assert.equal(editor.redo(), false);
      assert.deepEqual(Buffer.from(editor.save()), saved[2]);
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), saved[1]);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved[2]);
      editor.open(saved[2]);
      for (const target of selected) assert.equal(editor.paragraphTextSnapshot(0).find(row => row.paragraph === target.paragraph).text, "1");
      assert.deepEqual(Buffer.from(editor.save()), saved[2]);
      sequences++;
    }
    assert.equal(sequences, 8); assert.deepEqual(readFileSync(path), input);
  } finally {
    editor.close();
    assert.equal(digest(wasm), wasmHash); assert.equal(digest(readFileSync(process.env.HWPJS_TEST_WASM)), wasmHash);
  }
});
