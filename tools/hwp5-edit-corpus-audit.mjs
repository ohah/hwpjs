// Read-only inputs; mutated documents remain in memory, never overwrite fixtures.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { createHwp5Reader } from "../js/hwp5.mjs";
import { createExperimentalHwp5Editor } from "../js/hwp5-editor.mjs";
import { fixturePaths, sectionTexts, exerciseEditor, verifySaved } from "./hwp5-edit-corpus-lib.mjs";

const module = await WebAssembly.compile(readFileSync("zig-out/bin/hwpjs.wasm"));
const context = { module: { exports: {} }, require: createRequire(import.meta.url), Buffer, process };
runInNewContext(readFileSync("legacy/cfb.js", "utf8"), context);
function streams(bytes) {
  const parsed = context.module.exports.parse(Buffer.from(bytes)), result = new Map();
  parsed.FileIndex.forEach((entry, index) => {
    if (entry.type === 2) result.set(parsed.FullPaths[index].slice(parsed.FullPaths[0].length), Buffer.from(entry.content ?? []));
  });
  return result;
}
const paths = fixturePaths(execFileSync("git", ["ls-files", "-z"]).toString().split("\0"));
if (!paths.length) throw new Error("EmptyFixtureInventory");
const reader = await createHwp5Reader(module), files = [];
try {
  for (const path of paths) {
    if (/\.hwpx$/i.test(path)) { files.push({ path, status: "hwpx_public_parser_editor_not_connected" }); continue; }
    const bytes = readFileSync(path), result = { path };
    files.push(result);
    try {
      const preview = reader.readText(bytes);
      result.previewParagraphs = preview.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
    } catch (error) { result.status = "preview_refused"; result.error = error.message; continue; }
    let editor;
    try { editor = await createExperimentalHwp5Editor(module, bytes); }
    catch (error) { result.status = "editor_open_refused"; result.error = error.message; continue; }
    try {
      const before = streams(bytes), expected = sectionTexts(before);
      const { saved, ...audit } = exerciseEditor(editor, expected);
      Object.assign(result, audit);
      verifySaved(before, streams(saved.bytes), expected);
      if (!audit.edited) assert.deepEqual(Buffer.from(saved.bytes), bytes, "fully refused document must save byte-exact source");
      const reopened = await createExperimentalHwp5Editor(module, saved.bytes);
      try {
        assert.equal(reopened.sectionCount(), expected.size);
        for (const [section, texts] of expected) {
          assert.equal(reopened.paragraphCount(section), texts.length);
          texts.forEach((text, paragraph) => assert.deepEqual(Buffer.from(reopened.copyText(section, paragraph)), text ?? Buffer.alloc(0), "reopened editor text differs"));
        }
      } finally { reopened.close(); }
      result.status = audit.edited === audit.attempted ? "all_paragraph_splices_verified" : audit.edited ? "partial_paragraph_support" : "all_paragraph_splices_refused";
      result.textAndUnselectedStreamsVerified = true;
      result.savedEditorReopened = true;
    } catch (error) {
      result.status = "verification_failed"; result.error = error.message;
      process.exitCode = 1;
    } finally { editor.close(); }
  }
} finally { reader.close(); }
const counts = {};
for (const file of files) counts[file.status] = (counts[file.status] ?? 0) + 1;
const totals = { attempted: 0, edited: 0, failures: {} };
for (const file of files) {
  totals.attempted += file.attempted ?? 0;
  totals.edited += file.edited ?? 0;
  for (const [error, count] of Object.entries(file.failures ?? {})) totals.failures[error] = (totals.failures[error] ?? 0) + count;
}
console.log(JSON.stringify({ scope: "tracked fixtures, every HWP5 paragraph, real prefix splice and saved text oracle; not layout/format/UI proof", counts, totals, files }, null, 2));
