// Product WASM coverage, not an independent XML/ZIP oracle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
const paths = execFileSync("git", ["ls-files", "-z"]).toString().split("\0")
  .filter(path => path.includes("/fixtures/") && path.endsWith(".hwpx"));
assert.equal(paths.length, 45);
const counts = { files: paths.length, encrypted: 0, paragraphs: 0, accepted: 0, refused: {} };
try {
  for (const path of paths) {
    const input = readFileSync(path);
    if (path.endsWith("/password-12345.hwpx")) {
      assert.throws(() => editor.open(input), { message: "EncryptedDocument" });
      counts.encrypted++; continue;
    }
    editor.open(input);
    const original = reader.readTextEvents(input);
    const paragraphs = original.events.filter(event => event.kind === "paragraph_start");
    let accepted = 0;
    for (const paragraph of paragraphs) {
      counts.paragraphs++;
      const eligible = editor.canEdit(paragraph.section, paragraph.paragraph);
      try { editor.splice(paragraph.section, paragraph.paragraph, 0, 0, "검증😀<&\r"); }
      catch (error) {
        assert.equal(eligible, false, path);
        assert(["MissingTextSite", "UnsupportedParagraphControl", "UnsupportedInlineControl"].includes(error.message), `${path}: ${error.message}`);
        counts.refused[error.message] = (counts.refused[error.message] ?? 0) + 1;
        assert.deepEqual(Buffer.from(editor.save()), input, path);
        continue;
      }
      assert.equal(eligible, true, path);
      const saved = editor.save();
      const reopened = reader.readTextEvents(saved);
      const text = reopened.events.filter(event => event.kind === "content" && event.section === paragraph.section && event.paragraph === paragraph.paragraph).map(event => event.value).join("");
      const before = original.events.filter(event => event.kind === "content" && event.section === paragraph.section && event.paragraph === paragraph.paragraph).map(event => event.value).join("");
      assert.equal(text, `검증😀<&\r${before}`, `${path}: ${paragraph.paragraph}`);
      editor.splice(paragraph.section, paragraph.paragraph, 0, 7, "");
      assert.deepEqual(Buffer.from(editor.save()), input, path);
      counts.accepted++; accepted++;
    }
    console.log(JSON.stringify({ path, paragraphs: paragraphs.length, accepted }));
  }
  assert.equal(counts.encrypted, 1);
  console.log(JSON.stringify({ totals: counts }));
} finally { editor.close(); reader.close(); }
