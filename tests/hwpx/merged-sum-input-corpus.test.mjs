import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { executeOracle } from "../../tools/oracle-process-async.mjs";

test("actual fifteen merged-table SUM inputs preserve independent XML and history", async () => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitNumericCandidateRequired");
  const path = "reference/rhwp/samples/issue1891_external_bindata_link.hwpx", input = readFileSync(path);
  const targets = JSON.parse(await executeOracle("python3", ["tools/hwpx-merged-sum-input-oracle.py", "--inventory", path], { encoding: "utf8", timeout: 30000 }));
  assert.equal(targets.length, 15); assert.equal(new Set(targets.map(row => row.paragraph)).size, 15);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    for (const [index, target] of targets.entries()) {
      editor.open(input); editor.enableHistory(); assert.equal(editor.canEdit(0, target.paragraph), true);
      const original = editor.paragraphTextSnapshot(0).find(row => row.paragraph === target.paragraph); assert.equal(original.text, target.text);
      editor.splice(0, target.paragraph, 0, target.text.length, "1"); const saved = Buffer.from(editor.save()); assert(!saved.equals(input));
      for (const flags of [[], ["-O"]]) {
        const request = { before: input.toString("base64"), after: saved.toString("base64"), paragraph: target.paragraph, text: "1", selfTest: index === 0 };
        const result = await executeOracle("python3", [...flags, "tools/hwpx-merged-sum-input-oracle.py"], { input: JSON.stringify(request), encoding: "utf8", timeout: 30000 });
        if (index === 0) assert.match(result, /6 mutations rejected/);
      }
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
      const revision = editor.historyRevision();
      assert.throws(() => editor.splice(0, target.paragraph, 0, 0, "bad"), { message: "InvalidFormulaNumber" });
      assert.equal(editor.historyRevision(), revision); assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved); assert.equal(editor.paragraphTextSnapshot(0).find(row => row.paragraph === target.paragraph).text, "1");
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    assert.deepEqual(readFileSync(path), input);
  } finally { editor.close(); }
});
