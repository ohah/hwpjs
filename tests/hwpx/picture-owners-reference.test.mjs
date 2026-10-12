import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
const paths = ["sample-5017-pics", "shapecontainer-2"].map(name => `legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwpx`);
paths.push("reference/rhwp/samples/정책연구용역사업 중간진도보고서(살아있는 간장 기증자의 의학적 선별기준 연구).hwpx");
for (const path of paths) test(`picture owner batch matches every original scalar result: ${path}`, async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit batch candidate required");
  const input = readFileSync(path);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    const { sectionCount } = editor.open(input); editor.enableHistory();
    const revision = editor.historyRevision();
    let count = 0;
    for (let section = 0; section < sectionCount; section++) {
      const rows = editor.pictureOwners(section);
      for (const row of rows) {
        count++;
        let expected;
        try { expected = { pictureNode: row.pictureNode, owner: editor.pictureOwner(section, row.pictureNode), error: null }; }
        catch (error) { expected = { pictureNode: row.pictureNode, owner: null, error: error.message }; }
        assert.deepEqual(row, expected);
      }
    }
    assert(count > 0);
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); }
});
