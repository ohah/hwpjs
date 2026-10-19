import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
for (const format of ["hwp5", "hwpx"]) {
  const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`);
  async function open() {
    if (format === "hwp5") return createExperimentalHwp5Editor(wasm, input);
    const editor = await createHwpxEditor(wasm); editor.open(input); return editor;
  }
  const save = editor => Buffer.from(format === "hwp5" ? editor.save().bytes : editor.save());
  test(`${format} missing optional flow export preserves session and old save contract`, async t => {
    const instantiate = WebAssembly.instantiate;
    t.mock.method(WebAssembly, "instantiate", async (...args) => {
      const instance = await instantiate(...args);
      const exports = { ...instance.exports };
      delete exports[`${format}_edit_split_with_break`];
      return { exports };
    });
    const editor = await open();
    try {
      assert.equal(editor.supportsParagraphBreaks(), false);
      assert.throws(() => editor.splitParagraphWithBreak({ section: 0, paragraph: 1, atUnit: 0, kind: "page" }), /ParagraphBreakAbiUnavailable/);
      assert.deepEqual(save(editor), input);
    } finally { editor.close(); }
    assert.throws(() => editor.supportsParagraphBreaks(), /EditorClosed/);
  });

  test(`${format} adapter routes optional flow command to its own coordinate convention`, async t => {
    const instantiate = WebAssembly.instantiate;
    const calls = [];
    t.mock.method(WebAssembly, "instantiate", async (...args) => {
      const instance = await instantiate(...args);
      return { exports: { ...instance.exports, [`${format}_edit_split_with_break`]: (...values) => { calls.push(values); return 1; } } };
    });
    const editor = await open();
    try {
      assert.equal(editor.supportsParagraphBreaks(), true);
      editor.splitParagraphWithBreak({ section: 0, paragraph: 1, atUnit: 2, endUnit: 5, kind: "column" });
      assert.deepEqual(calls, [[0, 1, 2, format === "hwp5" ? 5 : 3, 2]]);
      assert.deepEqual(save(editor), input); // stub routing only, not native edit proof
    } finally { editor.close(); }
    assert.throws(() => editor.splitParagraphWithBreak({ section: 0, paragraph: 1, atUnit: 0, kind: "page" }), /EditorClosed/);
  });
}
