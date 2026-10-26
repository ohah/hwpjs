import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { sectionTexts, verifySaved } from "../../tools/hwp5-edit-corpus-lib.mjs";

test("all actual HWP5 chart nonnumeric refusals accept numeric replacement and retain history", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp");
  const module = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));
  const context = {
    module: { exports: {} },
    require: createRequire(import.meta.url),
    Buffer,
    process,
  };
  runInNewContext(readFileSync("legacy/cfb.js", "utf8"), context);
  const streams = (bytes) => {
    const cfb = context.module.exports.parse(Buffer.from(bytes)),
      output = new Map();
    cfb.FileIndex.forEach((entry, index) => {
      if (entry.type === 2)
        output.set(
          cfb.FullPaths[index].slice(cfb.FullPaths[0].length),
          Buffer.from(entry.content ?? []),
        );
    });
    return output;
  };
  const before = streams(input),
    source = sectionTexts(before);
  const editor = await createExperimentalHwp5Editor(module, input);
  let numeric = 0,
    examined = 0;
  try {
    editor.enableHistory();
    for (const [section, paragraphs] of source) {
      for (let paragraph = 0; paragraph < paragraphs.length; paragraph++) {
        examined++;
        let refused = false;
        try {
          editor.splice({ section, paragraph, startUnit: 0, endUnit: 0, text: "검증😀" });
        } catch (error) {
          assert.equal(error.message, "InvalidFormulaNumber");
          refused = true;
        }
        if (!refused) {
          assert.equal(editor.undo(), true);
          continue;
        }
        assert.deepEqual(
          Buffer.from(editor.save().bytes),
          input,
          "invalid numeric command must not dirty the original",
        );
        const text = Buffer.from(editor.copyText(section, paragraph)).toString("utf16le");
        assert(text.endsWith("\r"));
        editor.splice({ section, paragraph, startUnit: 0, endUnit: text.length - 1, text: "7" });
        assert.deepEqual(
          Buffer.from(editor.copyText(section, paragraph)),
          Buffer.from("7\r", "utf16le"),
        );
        const saved = editor.save({ allowStaleLayout: true });
        const after = streams(saved.bytes),
          independentlyRead = sectionTexts(after);
        assert.deepEqual(independentlyRead.get(section)[paragraph], Buffer.from("7\r", "utf16le"));
        verifySaved(before, after, independentlyRead); // Inventory and every non-body stream.
        const reopened = await createExperimentalHwp5Editor(module, saved.bytes);
        try {
          assert.deepEqual(
            Buffer.from(reopened.copyText(section, paragraph)),
            Buffer.from("7\r", "utf16le"),
          );
        } finally {
          reopened.close();
        }
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save().bytes), input);
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved.bytes);
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save().bytes), input);
        numeric++;
      }
    }
    assert.equal(examined, 175);
    assert.equal(numeric, 48);
    t.diagnostic(
      "175 source paragraphs classified, 48 numeric replacements; not independent formula arithmetic, layout, or browser proof",
    );
  } finally {
    editor.close();
  }
});
