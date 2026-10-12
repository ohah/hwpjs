import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { insertPrefix } from "../../tools/hwpx-prefix-edit-probe.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("run-level markpen preserves tables and hyperlink metadata during actual prefix edits", async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit run markpen candidate required");
  const path = "reference/rhwp/samples/정책연구용역사업 중간진도보고서(살아있는 간장 기증자의 의학적 선별기준 연구).hwpx";
  const input = readFileSync(path);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    for (const paragraph of [32, 119, 192, 1949]) {
      editor.open(input); editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
      const text = "앞😀<&";
      insertPrefix(editor, 0, paragraph, text);
      const saved = Buffer.from(editor.save());
      const payload = { before: input.toString("base64"), after: saved.toString("base64"), section: 0, paragraph, text,
        mode: paragraph === 1949 ? "direct_text" : "after_run_markpen" };
      for (const flags of [[], ["-O"]]) {
        const check = data => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(data), timeout: 30000 });
        check(payload);
        assert.throws(() => check({ ...payload, text: "wrong" }), error => error.status === 1 && /ValueError: complete XML mismatch/.test(String(error.stderr)));
        if (paragraph === 32) assert.throws(() => check({ ...payload, mode: "anchored" }), error => error.status === 1 && /ValueError: complete XML mismatch/.test(String(error.stderr)), "before-marker affinity must not match after-marker insertion");
      }
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved); assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    assert.deepEqual(readFileSync(path), input);
  } finally { editor.close(); }
});
