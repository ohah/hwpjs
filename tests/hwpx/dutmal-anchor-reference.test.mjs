import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { insertPrefix } from "../../tools/hwpx-prefix-edit-probe.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("dutmal protected anchor preserves both strings during surrounding text input", async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit dutmal candidate required");
  const input = readFileSync("reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input); editor.enableHistory();
    assert.equal(editor.canEdit(0, 26), false);
    assert.throws(() => editor.anchorText(0, 26), /UnsupportedStructuralFieldEdit/);
    const targets = editor.fieldLabels(0, 26);
    assert.equal(targets.length, 1);
    assert.deepEqual({ start: targets[0].start, end: targets[0].end }, { start: 0, end: 51 });
    // Independent source text lengths: 43 before dutmal, one protected unit.
    assert.throws(() => editor.spliceFieldLabel(0, 26, targets[0].beginElement, 43, 1, ""), /ProtectedInlineControl/);
    assert.deepEqual(Buffer.from(editor.save()), input);
    const text = "앞😀<&";
    insertPrefix(editor, 0, 26, text);
    assert.equal(editor.fieldLabels(0, 26)[0].end, targets[0].end + text.length);
    const saved = Buffer.from(editor.save());
    const request = { before: input.toString("base64"), after: saved.toString("base64"), section: 0, paragraph: 26, text, mode: "direct_text" };
    for (const flags of [[], ["-O"]]) {
      const verify = value => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(value), timeout: 30000 });
      verify(request);
      assert.throws(() => verify({ ...request, text: "wrong" }), error => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)));
    }
    assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved); assert.equal(editor.fieldLabels(0, 26)[0].end, targets[0].end + text.length);
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally { editor.close(); }
});
