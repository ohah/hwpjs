import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { executeOracle } from "../../tools/oracle-process-async.mjs";

test("all ladder numeric inputs update direct and downstream SUM XML while preserving history", async () => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitNumericCandidateRequired");
  const path = "reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx",
    input = readFileSync(path);
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest(input), "6adca8d39bdcf51e8791d8afa1e584b9570eb8b15df901e74ce61cfd500cdb4a");
  const targets = JSON.parse(
    await executeOracle(
      "python3",
      ["tools/hwpx-cascaded-sum-input-oracle.py", "--inventory", path],
      { encoding: "utf8", timeout: 30000 },
    ),
  );
  assert.equal(targets.length, 28);
  assert.equal(new Set(targets.map((row) => row.paragraph)).size, 28);
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM),
    wasmHash = digest(wasm);
  const editor = await createHwpxEditor(wasm);
  const affected = { 1: 0, 2: 0 };
  try {
    for (const [index, target] of targets.entries()) {
      editor.open(input);
      editor.enableHistory();
      assert.equal(editor.canEdit(0, target.paragraph), true);
      assert.equal(
        editor.paragraphTextSnapshot(0).find((row) => row.paragraph === target.paragraph).text,
        target.text,
      );
      const text = target.text.replaceAll(",", "") === "1" ? "2" : "1";
      editor.splice(0, target.paragraph, 0, target.text.length, text);
      const saved = Buffer.from(editor.save());
      assert(!saved.equals(input));
      let result;
      for (const flags of [[], ["-O"]]) {
        const request = {
          before: input.toString("base64"),
          after: saved.toString("base64"),
          paragraph: target.paragraph,
          text,
          selfTest: index === 0,
        };
        const current = JSON.parse(
          await executeOracle("python3", [...flags, "tools/hwpx-cascaded-sum-input-oracle.py"], {
            input: JSON.stringify(request),
            encoding: "utf8",
            timeout: 30000,
          }),
        );
        assert.equal(current.inputs, 28);
        assert.equal(current.formulas, 14);
        if (index === 0) assert.equal(current.rejectedMutants, 8);
        if (index === 0)
          for (const [patch, message] of [
            [{ paragraph: target.paragraph + 1 }, /Complete cascaded SUM XML mismatch/],
            [{ paragraph: true }, /Explicit ladder input/],
            [{ text: "0" }, /Explicit ladder input/],
            [{ before: "" }, /Observed ladder source bytes/],
          ]) {
            await assert.rejects(
              () =>
                executeOracle("python3", [...flags, "tools/hwpx-cascaded-sum-input-oracle.py"], {
                  input: JSON.stringify({ ...request, ...patch, selfTest: false }),
                  encoding: "utf8",
                  timeout: 30000,
                }),
              (error) =>
                error.status === 1 && error.signal === null && message.test(String(error.stderr)),
            );
          }
        if (result) assert.deepEqual(current, result);
        result = current;
      }
      affected[result.affected.length]++;
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      const revision = editor.historyRevision();
      assert.throws(() => editor.splice(0, target.paragraph, 0, 0, "bad"), {
        message: "InvalidFormulaNumber",
      });
      assert.equal(editor.historyRevision(), revision);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.equal(
        editor.paragraphTextSnapshot(0).find((row) => row.paragraph === target.paragraph).text,
        text,
      );
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    assert.deepEqual(affected, { 1: 7, 2: 21 });
    assert.deepEqual(readFileSync(path), input);
  } finally {
    editor.close();
    assert.equal(digest(wasm), wasmHash, "candidate buffer changed during verification");
    assert.equal(
      digest(readFileSync(process.env.HWPJS_TEST_WASM)),
      wasmHash,
      "candidate file changed during verification",
    );
  }
});
