import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { verifyRaw } from "./style-preservation/text-record-oracle.mjs";

test("all scalar-bounded ranges in seeded empty table paragraphs preserve typed queries history and independent records", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const wasm = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));
  const path = "reference/rhwp/samples/253E164F57A1BC6934-empty.hwp",
    input = readFileSync(path);
  const seed = "가😀나",
    boundaries = [0, 1, 3, 4];
  let attempts = 0;
  const queries = (editor) => ({
    bindings: editor.tableBindings(0),
    placements: editor.tablePlacements(0),
    tables: editor.tableLayoutSources(0),
    cells: editor.cellLayoutSources(0),
  });
  for (const paragraph of [1, 2, 3, 5]) {
    const editor = await createExperimentalHwp5Editor(wasm, input, { normalizeObservedCfb: true });
    try {
      editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: seed });
      const baseline = editor.save({ allowStaleLayout: true }).bytes,
        original = editor.text(0, paragraph);
      assert.equal(original, seed + "\r");
      const sources = queries(editor);
      editor.enableHistory();
      for (const startUnit of boundaries)
        for (const endUnit of boundaries.filter((unit) => unit >= startUnit)) {
          for (const text of ["치환😀", ""]) {
            if (startUnit === endUnit && !text) continue;
            editor.splice({ section: 0, paragraph, startUnit, endUnit, text });
            const saved = editor.save({ allowStaleLayout: true }).bytes;
            verifyRaw(baseline, saved, 0, paragraph, startUnit, endUnit, text);
            assert.throws(
              () => verifyRaw(baseline, saved, 0, paragraph, startUnit, endUnit, "wrong"),
              assert.AssertionError,
            );
            assert.deepEqual(queries(editor), sources);
            const reopened = await createExperimentalHwp5Editor(wasm, saved);
            try {
              assert.equal(
                reopened.text(0, paragraph),
                original.slice(0, startUnit) + text + original.slice(endUnit),
              );
              assert.deepEqual(queries(reopened), sources);
            } finally {
              reopened.close();
            }
            assert.equal(editor.undo(), true);
            assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, baseline);
            assert.equal(editor.redo(), true);
            assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
            assert.equal(editor.undo(), true);
            assert.throws(
              () => editor.splice({ section: 0, paragraph, startUnit: 2, endUnit: 2, text: "X" }),
              /SplitSurrogatePair/,
            );
            assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, baseline);
            // A rejected mutation must not erase the previously established redo.
            assert.equal(editor.redo(), true);
            assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
            assert.equal(editor.undo(), true);
            attempts++;
          }
        }
    } finally {
      editor.close();
    }
  }
  assert.equal(attempts, 64);
  assert.deepEqual(readFileSync(path), input);
  t.diagnostic(
    "64 seeded scalar-bounded insert/replace/delete transactions across four cell paragraphs; not all document commands or Hancom layout equality",
  );
});
