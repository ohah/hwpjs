import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHwpxEditor} from "../../js/hwpx-editor.mjs";
test("native formula paragraph candidates preserve all chart fields and current history", async () => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit formula candidate required");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input); editor.enableHistory();
    const paragraphs = editor.manualFormulaResultParagraphs(0);
    const fields = paragraphs.flatMap(paragraph => editor.manualFormulaResultTargets(0, paragraph));
    assert.equal(fields.length, 13);
    assert.deepEqual(fields.map(row => row.beginElement).sort((a,b)=>a-b), editor.formulaSources(0).map(row=>row.begin_element).sort((a,b)=>a-b));
    assert.deepEqual(Buffer.from(editor.save()), input);
    const paragraph = paragraphs[0], target = editor.manualFormulaResultTargets(0, paragraph)[0];
    editor.spliceManualFormulaResult(0, target.beginElement, 0, 0, "값😀");
    const saved = Buffer.from(editor.save());
    assert.deepEqual(editor.manualFormulaResultParagraphs(0), paragraphs);
    assert.equal(editor.manualFormulaResultTargets(0, paragraph)[0].end, target.end + 3);
    assert.throws(() => editor.manualFormulaResultParagraphs(1), /InvalidSectionIndex/);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    assert.deepEqual(editor.manualFormulaResultParagraphs(0), paragraphs);
    for (const display of ["", " ", "😀"]) {
      editor.open(input);
      editor.setManualFormulaResult(0, target.beginElement, display);
      const current = Buffer.from(editor.save());
      assert.deepEqual(editor.manualFormulaResultParagraphs(0), paragraphs);
      const range = editor.manualFormulaResultTargets(0, paragraph)[0];
      assert.equal(range.end - range.start, display.length);
      assert.deepEqual(Buffer.from(editor.save()), current);
    }
  } finally { editor.close(); }
});
