import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

test("actual twelve HWPX title paragraphs preserve markers and whole XML through prefix history", async () => {
  const original = readFileSync("reference/rhwp/samples/task1771/nested_group_vectors.hwpx");
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  const text = "제목앞😀<&";
  try {
    for (const paragraph of [55, 56, 65, 73, 74, 84, 110, 111, 121, 131, 184, 191]) {
      editor.open(original);
      editor.enableHistory();
      assert.equal(editor.canEdit(0, paragraph), true);
      editor.splice(0, paragraph, 0, 0, text);
      const saved = editor.save();
      const data = {
        mode: "direct_text",
        before: original.toString("base64"),
        after: Buffer.from(saved).toString("base64"),
        section: 0,
        paragraph,
        text,
      };
      for (const flags of [[], ["-O"]]) {
        const check = (value) =>
          execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
            input: JSON.stringify(value),
            timeout: 30000,
          });
        check(data);
        assert.throws(
          () => check({ ...data, text: "잘못된기대값" }),
          (error) =>
            error.status === 1 &&
            error.signal === null &&
            !error.code &&
            /ValueError: complete XML mismatch/.test(String(error.stderr)),
        );
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), original);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save(), saved);
      editor.open(saved);
      assert.deepEqual(editor.save(), saved);
    }
  } finally {
    editor.close();
  }
});
