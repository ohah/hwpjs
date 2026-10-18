import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { insertPrefix } from "../../tools/hwpx-prefix-edit-probe.mjs";

test("anchored oracle keeps the existing empty run before a differently styled table", () => {
  for (const flags of [[], ["-O"]]) {
    const result = JSON.parse(execFileSync("python3", [...flags, "tests/hwpx/anchor-empty-run-oracle.py"], { encoding: "utf8", timeout: 30000 }));
    assert.deepEqual(result, { accepted: 1, rejected: 4 });
  }
});

test("actual hwpx_sample2 empty source run preserves style XML history and reopen", async t => {
  const path = "reference/rhwp/samples/hwpx_sample2.hwpx";
  if (!existsSync(path)) return t.skip("RHWP reference fixture is not present");
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const input = readFileSync(path), marker = "경로😀<&";
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input); editor.enableHistory();
    const original = editor.anchorText(0, 1);
    assert.equal(original, "\ufffc");
    insertPrefix(editor, 0, 1, marker);
    const saved = Buffer.from(editor.save());
    const request = { mode: "anchored", before: input.toString("base64"), after: saved.toString("base64"), section: 0, paragraph: 1, text: marker };
    const mutants = JSON.parse(execFileSync("python3", ["tests/hwpx/anchor-empty-run-oracle.py", "--mutants"], { input: JSON.stringify(request), encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 }));
    for (const flags of [[], ["-O"]]) {
      const verify = value => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(value), encoding: "utf8", timeout: 30000 });
      assert.equal(verify(request), "");
      for (const after of Object.values(mutants)) assert.throws(() => verify({ ...request, after }), error => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)));
    }
    assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved);
    assert.equal(editor.anchorText(0, 1), marker + original);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    for (const after of Object.values(mutants)) {
      editor.open(Buffer.from(after, "base64"));
      assert.equal(editor.anchorText(0, 1), marker + original, "text-only checks cannot detect wrong owner/style");
    }
    assert.deepEqual(readFileSync(path), input);
  } finally { editor.close(); }
});
