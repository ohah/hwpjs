import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

const wasm = process.env.HWPJS_TEST_WASM ? readFileSync(process.env.HWPJS_TEST_WASM) : null;
for (const format of ["hwp5", "hwpx"])
  for (const kind of ["page", "column"])
    for (const resplit of [false, true]) {
      test(
        `${format} ${kind} survives generated follow-up input and merge resplit=${resplit}`,
        { skip: !wasm ? "explicit flow candidate required" : false },
        async () => {
          const input = readFileSync(
            `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`,
          );
          const open = async (bytes) => {
            if (format === "hwp5") return createExperimentalHwp5Editor(wasm, bytes);
            const editor = await createHwpxEditor(wasm);
            editor.open(bytes);
            return editor;
          };
          const editor = await open(input);
          const save = (instance) =>
            Buffer.from(
              format === "hwp5" ? instance.save({ allowStaleLayout: true }).bytes : instance.save(),
            );
          const text = (instance, paragraph) =>
            format === "hwp5"
              ? instance.text(0, paragraph)
              : instance.paragraphTextSnapshot(0).find((row) => row.paragraph === paragraph).text;
          const flow = (instance) => {
            const row = instance.paragraphFlow(0).find((value) => value.paragraph === 2);
            assert(row, "generated paragraph flow must exist");
            assert.equal(row.page_break, kind === "page");
            assert.equal(row.column_break, kind === "column");
          };
          try {
            editor.enableHistory();
            const originalText = text(editor, 1);
            editor.splitParagraphWithBreak({ section: 0, paragraph: 1, atUnit: 0, kind });
            if (resplit) editor.splitParagraph({ section: 0, paragraph: 2, atUnit: 0 });
            flow(editor);
            const beforeInput = save(editor);
            let expectedText = "후속😀<&" + text(editor, 2);
            if (format === "hwp5")
              editor.splice({
                section: 0,
                paragraph: 2,
                startUnit: 0,
                endUnit: 0,
                text: "후속😀<&",
              });
            else editor.splice(0, 2, 0, 0, "후속😀<&");
            flow(editor);
            assert.equal(text(editor, 2), expectedText);
            const afterInput = save(editor);
            assert.notDeepEqual(afterInput, beforeInput);
            assert.equal(editor.undo(), true);
            assert.deepEqual(save(editor), beforeInput);
            flow(editor);
            assert.equal(editor.redo(), true);
            assert.deepEqual(save(editor), afterInput);
            if (resplit) {
              editor.mergeParagraph({ section: 0, paragraph: 2 });
              flow(editor);
              expectedText = "후속😀<&" + originalText;
              assert.equal(text(editor, 2), expectedText);
              const merged = save(editor);
              assert.equal(editor.undo(), true);
              assert.deepEqual(save(editor), afterInput);
              assert.equal(editor.redo(), true);
              assert.deepEqual(save(editor), merged);
            }
            const saved = save(editor),
              reopened = await open(saved);
            try {
              flow(reopened);
              assert.equal(text(reopened, 2), expectedText);
              assert.deepEqual(save(reopened), saved);
            } finally {
              reopened.close();
            }
          } finally {
            editor.close();
          }
        },
      );
    }
