import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

test("dutmal BOM and invalid commands preserve exact current data and pending redo", async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit dutmal candidate required");
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  const input = readFileSync("reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx");
  const editor = await createHwpxEditor(wasm);
  try {
    editor.open(input); editor.enableHistory();
    const node = editor.inlineStringSources().controls.find(row => row.kind === "dutmal").element_index;
    const value = "\ufeff😀<&";
    editor.setDutmalText(0, node, "mainText", value);
    assert.equal(editor.dutmalText(0, node, "mainText"), value);
    const saved = Buffer.from(editor.save());
    const revision = editor.historyRevision();
    assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 0 }), /UnsupportedDutmalStructuralSave/);
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.setDutmalText(0, node, "mainText", "\ud800"), /InvalidText/);
    assert.throws(() => editor.setDutmalText(0, node, "mainText", "bad\0"), /InvalidXmlCharacter/);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved);
    const current = editor.inlineStringSources().controls.find(row => row.kind === "dutmal").element_index;
    assert.equal(editor.dutmalText(0, current, "mainText"), value);
  } finally { editor.close(); }
});
