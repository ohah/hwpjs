import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { formulaExteriorFixture } from "../../tools/hwpx-formula-exterior-fixture.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("derived actual chart exterior edit preserves stale source result with independent XML ZIP and history", async () => {
  const { input } = formulaExteriorFixture("same-run", { mixed: true });
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    editor.open(input);
    const first = editor.formulaSources(0)[0];
    assert.equal(first.values.last_result, "67.5");
    editor.setManualFormulaResult(0, first.begin_element, "100");
    const before = Buffer.from(editor.save());
    editor.open(before); editor.enableHistory();
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "100");
    assert.equal(editor.paragraphTextSnapshot(0)[1].text, "outsidelabel");
    assert.equal(editor.canEditOutsideField(0, 2, 0, 0), true);
    editor.splice(0, 2, 0, 0, "한😀");
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "100");
    const after = Buffer.from(editor.save());
    const request = { mode: "plain_text", section: 0, paragraph: 2, text: "한😀", before: before.toString("base64"), after: after.toString("base64") };
    const wrong = execFileSync("python3", ["tests/hwpx/formula-result-mutation.py"], {
      input: JSON.stringify({ bytes: request.after, ordinal: 0, display: "67.5" }), encoding: "utf8", timeout: 30000,
    }).trim();
    for (const flags of [[], ["-O"]]) {
      const verify = data => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(data), encoding: "utf8", timeout: 30000 });
      verify(request);
      assert.throws(() => verify({ ...request, after: wrong }), error => error.status === 1 && String(error.stderr).includes("complete XML mismatch"));
    }
    assert.equal(editor.undo(), true); assert(Buffer.from(editor.save()).equals(before));
    assert.equal(editor.redo(), true); assert(Buffer.from(editor.save()).equals(after));
    assert.equal(editor.paragraphTextSnapshot(0)[20].text, "11.2");
    editor.splice(0, 21, 0, 4, "100");
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "156.3");
    const recalculated = Buffer.from(editor.save());
    assert.equal(editor.undo(), true); assert(Buffer.from(editor.save()).equals(after));
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "100");
    assert.equal(editor.redo(), true); assert(Buffer.from(editor.save()).equals(recalculated));
    assert.equal(editor.undo(), true); assert(Buffer.from(editor.save()).equals(after));
    editor.open(after);
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "100");
    assert.equal(editor.formulaSources(0)[0].values.last_result, "67.5");
    assert(Buffer.from(editor.save()).equals(after));
  } finally { editor.close(); }
});
