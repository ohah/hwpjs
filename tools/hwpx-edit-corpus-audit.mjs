// Product WASM coverage, not an independent XML/ZIP oracle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const history = process.argv.includes("--history");
const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
const paths = execFileSync("git", ["ls-files", "-z"]).toString().split("\0")
  .filter(path => path.includes("/fixtures/") && path.endsWith(".hwpx"));
assert.equal(paths.length, 45);
const counts = { files: paths.length, encrypted: 0, paragraphs: 0, accepted: 0, refused: {}, history, restored: 0, refusalRedoPreserved: 0 };
try {
  for (const path of paths) {
    const input = readFileSync(path);
    if (path.endsWith("/password-12345.hwpx")) {
      assert.throws(() => editor.open(input), { message: "EncryptedDocument" });
      counts.encrypted++; continue;
    }
    editor.open(input);
    if (history) editor.enableHistory();
    const original = reader.readTextEvents(input);
    const paragraphs = original.events.filter(event => event.kind === "paragraph_start");
    let accepted = 0;
    let previousEdited = null;
    for (const paragraph of paragraphs) {
      counts.paragraphs++;
      const eligible = editor.canEdit(paragraph.section, paragraph.paragraph);
      try { editor.splice(paragraph.section, paragraph.paragraph, 0, 0, "검증😀<&\r"); }
      catch (error) {
        if (error.message === "InvalidFormulaNumber") {
          // Editable numeric cells still reject this deliberately nonnumeric
          // prefix. Structural eligibility is not permission for every value.
          assert.equal(eligible, true, path);
        } else {
          assert.equal(eligible, false, path);
          assert(["MissingTextSite", "UnsupportedParagraphControl", "UnsupportedInlineControl"].includes(error.message), `${path}: ${error.message}`);
        }
        counts.refused[error.message] = (counts.refused[error.message] ?? 0) + 1;
        assert.deepEqual(Buffer.from(editor.save()), input, path);
        if (history) {
          assert.equal(editor.undo(), false, path);
          assert.equal(editor.redo(), previousEdited !== null, path);
          if (previousEdited !== null) {
            assert.deepEqual(editor.save(), previousEdited, path);
            assert.equal(editor.undo(), true, path);
            assert.deepEqual(Buffer.from(editor.save()), input, path);
            counts.refusalRedoPreserved++;
          }
        }
        continue;
      }
      assert.equal(eligible, true, path);
      const saved = editor.save();
      const reopened = reader.readTextEvents(saved);
      const text = reopened.events.filter(event => event.kind === "content" && event.section === paragraph.section && event.paragraph === paragraph.paragraph).map(event => event.value).join("");
      const before = original.events.filter(event => event.kind === "content" && event.section === paragraph.section && event.paragraph === paragraph.paragraph).map(event => event.value).join("");
      assert.equal(text, `검증😀<&\r${before}`, `${path}: ${paragraph.paragraph}`);
      if (history) {
        assert.equal(editor.redo(), false, path);
        assert.equal(editor.undo(), true, path);
        assert.deepEqual(Buffer.from(editor.save()), input, path);
        assert.equal(editor.redo(), true, path);
        assert.deepEqual(editor.save(), saved, path);
        assert.equal(editor.undo(), true, path);
        previousEdited = saved;
        counts.restored++;
      } else editor.splice(paragraph.section, paragraph.paragraph, 0, 7, "");
      assert.deepEqual(Buffer.from(editor.save()), input, path);
      counts.accepted++; accepted++;
    }
    console.log(JSON.stringify({ path, paragraphs: paragraphs.length, accepted }));
  }
  assert.equal(counts.encrypted, 1);
  console.log(JSON.stringify({ totals: counts }));
} finally { editor.close(); reader.close(); }
