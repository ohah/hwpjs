import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

const cases = [
  ["reference/rhwp/samples/hwpx/issue2019_floating_form_74312.hwpx", [1, 21, 46, 147, 185, 300, 348, 500, 591, 877]],
  ["reference/rhwp/samples/issue3460/svg_picture_repro.hwpx", [1]],
  ["reference/rhwp/samples/issue5780/flow_image_page_background.hwpx", [1]],
  ["reference/rhwp/samples/issue6179/right_tab_footer_logo.hwpx", [1]],
];
for (const [path, paragraphs] of cases) test(`metadata-only paragraph input retains settings and page areas: ${path}`, async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit section metadata candidate required");
  const input = readFileSync(path);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    for (const paragraph of paragraphs) {
      editor.open(input); editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
      assert.equal(editor.canEdit(0, paragraph), true);
      const text = "설정😀<&";
      editor.splice(0, paragraph, 0, 0, text);
      const saved = Buffer.from(editor.save());
      const payload = { before: input.toString("base64"), after: saved.toString("base64"), section: 0, paragraph, text, mode: "metadata_run" };
      for (const flags of [[], ["-O"]]) {
        const check = data => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(data), timeout: 30000 });
        check(payload);
        assert.throws(() => check({ ...payload, text: "wrong" }), error => error.status === 1 && /ValueError: complete XML mismatch/.test(String(error.stderr)));
      }
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved); assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    assert.deepEqual(readFileSync(path), input);
  } finally { editor.close(); }
});
