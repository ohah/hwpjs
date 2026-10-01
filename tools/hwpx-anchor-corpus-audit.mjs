// Public opt-in anchored edit coverage, separate from legacy plain offsets.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
const files = execFileSync("git", ["ls-files", "-z"]).toString().split("\0").filter(path => path.includes("/fixtures/") && path.endsWith(".hwpx"));
const prefix = "검증😀";
const leadingBoundary = process.argv.includes("--leading-boundary");
const totals = { boundary: leadingBoundary ? "leading" : "after-leading-anchors", files: files.length, encrypted: 0, candidates: 0, accepted: 0, refused: {} };
try {
  for (const path of files) {
    const input = readFileSync(path);
    try { editor.open(input); }
    catch (error) { assert.equal(error.message, "EncryptedDocument"); totals.encrypted++; continue; }
    const paragraphs = reader.readTextEvents(input).events.filter(e => e.kind === "paragraph_start");
    let accepted = 0;
    for (const paragraph of paragraphs) {
      editor.open(input);
      if (editor.canEdit(paragraph.section, paragraph.paragraph)) continue;
      totals.candidates++;
      let before;
      let start = 0;
      try {
        before = editor.anchorText(paragraph.section, paragraph.paragraph);
        // Choose the boundary after leading protected anchors, not an
        // unmaterialized position before an object-only run.
        if (!leadingBoundary) while (before[start] === "\ufffc") start++;
        editor.spliceAnchored(paragraph.section, paragraph.paragraph, start, 0, prefix);
      } catch (error) {
        assert(["UnsupportedParagraphControl", "UnsupportedInlineControl", "MissingTextSite", "SourceBindingMismatch", "InvalidTextPosition", "InvalidFormulaNumber"].includes(error.message), `${path}: ${error.message}`);
        assert.deepEqual(Buffer.from(editor.save()), input);
        totals.refused[error.message] = (totals.refused[error.message] ?? 0) + 1;
        continue;
      }
      const expected = before.slice(0, start) + prefix + before.slice(start);
      assert.equal(editor.anchorText(paragraph.section, paragraph.paragraph), expected);
      const saved = editor.save();
      const reopened = await createHwpxEditor(wasm);
      try {
        reopened.open(saved);
        assert.equal(reopened.anchorText(paragraph.section, paragraph.paragraph), expected);
        assert.deepEqual(reopened.save(), saved);
      } finally { reopened.close(); }
      editor.spliceAnchored(paragraph.section, paragraph.paragraph, start, prefix.length, "");
      assert.deepEqual(Buffer.from(editor.save()), input);
      totals.accepted++; accepted++;
    }
    console.log(JSON.stringify({ path, accepted }));
  }
  console.log(JSON.stringify({ totals }));
} finally { editor.close(); reader.close(); }
