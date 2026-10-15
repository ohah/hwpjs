import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("actual nested fields edit owned prefixes and preserve every marker and ancestor dirty", async () => {
  assert(process.env.HWPJS_TEST_WASM, "requires explicit nested candidate");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    for (const [name, paragraph, beginId, selected] of [
      ["80168", 3807, "1575661791", 1],
      ["86712", 1261, "1505851853", 1],
      ["86712", 1261, "1505851852", 0],
    ]) {
      const path = `reference/rhwp/samples/issue1891/${name}_regulatory_analysis.hwpx`;
      const input = readFileSync(path);
      editor.open(input);
      editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
      const targets = editor.fieldLabels(0, paragraph);
      assert.equal(targets.length, 2);
      const target = targets[selected], child = targets[1];
      const revision = editor.historyRevision();
      const selectRange = editor.fieldRangeTarget;
      assert.deepEqual(selectRange(0, paragraph, target.start, target.start), target);
      const whole = selectRange(0, paragraph, targets[0].start, targets[0].end);
      if (targets[0].start === child.start && targets[0].end === child.end) assert.deepEqual(whole, child);
      else assert.equal(whole, null);
      assert.equal(editor.historyRevision(), revision);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.throws(() => editor.spliceFieldLabel(0, paragraph, targets[0].beginElement, child.start, 0, "blocked"), /ProtectedFieldRange/);
      assert.deepEqual(Buffer.from(editor.save()), input);
      const text = "중첩😀<&";
      editor.spliceFieldLabel(0, paragraph, target.beginElement, target.start, 0, text);
      assert.throws(() => selectRange(0, paragraph, target.start + 3, target.start + 3), /SplitSurrogatePair/);
      const saved = Buffer.from(editor.save());
      const payload = { before: input.toString("base64"), after: saved.toString("base64"), paragraph, beginId, text };
      for (const flags of [[], ["-O"]]) {
        const check = data => execFileSync("python3", [...flags, "tools/hwpx-nested-field-edit-oracle.py"], { input: JSON.stringify(data), timeout: 30000 });
        check(payload);
        assert.throws(() => check({ ...payload, text: "wrong" }), e => e.status === 1 && /complete XML mismatch/.test(String(e.stderr)));
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      assert.deepEqual(readFileSync(path), input);
    }
  } finally { editor.close(); }
});
