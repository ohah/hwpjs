import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

const path = "reference/rhwp/samples/issue1891/80168_regulatory_analysis.hwpx";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

test("actual sequential hyperlinks permit exterior prefixes without losing inline breaks", async () => {
  assert(process.env.HWPJS_TEST_WASM, "requires an explicit candidate WASM");
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  const input = readFileSync(path), inputHash = digest(input);
  const editor = await createHwpxEditor(wasm);
  try {
    for (const paragraph of [324, 330, 331, 2395]) {
      editor.open(input);
      editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
      assert.equal(editor.canEditOutsideField(0, paragraph, 0, 0), true);
      const labels = editor.fieldLabels(0, paragraph);
      assert(labels.length > 1);
      assert(labels.every(label => label.start > 0));
      const text = "검증😀<&";
      editor.splice(0, paragraph, 0, 0, text);
      const saved = Buffer.from(editor.save());
      const payload = { before: input.toString("base64"), after: saved.toString("base64"), section: 0, paragraph, text };
      for (const flags of [[], ["-O"]]) {
        const check = data => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(data), timeout: 30000 });
        check(payload);
        assert.throws(() => check({ ...payload, text: "wrong" }), error => error.status === 1 && /ValueError: complete XML mismatch/.test(String(error.stderr)));
      }
      const current = editor.fieldLabels(0, paragraph);
      assert.equal(current.length, labels.length);
      assert.equal(editor.canEditOutsideField(0, paragraph, current[0].start, current[0].start), false);
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    assert.equal(digest(readFileSync(path)), inputHash);
  } finally { editor.close(); }
});
