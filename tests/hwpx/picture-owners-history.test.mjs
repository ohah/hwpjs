import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("picture batches follow structural edits and history without caching original ownership", async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit batch candidate required");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/shapepict-scaled.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input); editor.enableHistory();
    const check = () => {
      const revision = editor.historyRevision();
      const saved = Buffer.from(editor.save());
      const rows = editor.pictureOwners(0);
      for (const row of rows) {
        assert.equal(row.error, null);
        assert.deepEqual(row.owner, editor.pictureOwner(0, row.pictureNode));
      }
      assert.equal(editor.historyRevision(), revision);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      return rows;
    };
    const original = check();
    editor.splitParagraphAnchored({ section: 0, paragraph: 1, atUnit: 0 });
    const split = check();
    assert.equal(split[0].owner.paragraph, original[0].owner.paragraph + 1);
    editor.spliceAnchored(0, 2, 0, 0, "앞😀");
    const inserted = check();
    assert.equal(inserted[0].owner.anchorUnit, original[0].owner.anchorUnit + 3);
    const splitSaved = Buffer.from(editor.save());
    editor.mergeParagraph({ section: 0, paragraph: 1 });
    const merged = check();
    assert.equal(merged[0].owner.paragraph, original[0].owner.paragraph);
    const mergedSaved = Buffer.from(editor.save());
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-anchor-object-oracle.py"], {
      input: JSON.stringify({ before: input.toString("base64"), after: mergedSaved.toString("base64") }), timeout: 30000,
    });
    assert.equal(editor.undo(), true); assert.deepEqual(check(), inserted);
    assert.deepEqual(Buffer.from(editor.save()), splitSaved);
    assert.equal(editor.redo(), true); assert.deepEqual(check(), merged);
    assert.deepEqual(Buffer.from(editor.save()), mergedSaved);
    editor.open(mergedSaved);
    assert.deepEqual(editor.pictureOwners(0).map(row => row.owner.paragraph), merged.map(row => row.owner.paragraph));
    assert.deepEqual(Buffer.from(editor.save()), mergedSaved);
  } finally { editor.close(); }
});
