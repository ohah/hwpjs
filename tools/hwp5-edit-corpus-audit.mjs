// Read-only inputs; mutated documents remain in memory, never overwrite fixtures.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { detectDocumentFormat } from "../js/document-format.mjs";
import { createHwp5Reader } from "../js/hwp5.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";
import { createExperimentalHwp5Editor } from "../js/hwp5-editor.mjs";
import { fixturePaths, sectionTexts, exerciseEditor, verifySaved } from "./hwp5-edit-corpus-lib.mjs";

const args = process.argv.slice(2);
const wasmArgs = args.filter(argument => argument.startsWith("--wasm="));
const fixtureArgs = args.filter(argument => argument.startsWith("--fixture="));
if (wasmArgs.length > 1 || fixtureArgs.length > 1 || args.filter(argument => argument === "--history").length > 1) throw new Error("DuplicateAuditArgument");
for (const argument of args) if (argument !== "--history" && !(argument.startsWith("--wasm=") && argument.length > 7) && !(argument.startsWith("--fixture=") && argument.length > 10)) throw new Error(`Unknown argument: ${argument}`);
const wasmBytes = readFileSync(wasmArgs[0]?.slice(7) ?? "zig-out/bin/hwpjs.wasm");
const module = await WebAssembly.compile(wasmBytes);
const history = args.includes("--history");
const context = { module: { exports: {} }, require: createRequire(import.meta.url), Buffer, process };
runInNewContext(readFileSync("legacy/cfb.js", "utf8"), context);
function streams(bytes) {
  const parsed = context.module.exports.parse(Buffer.from(bytes)), result = new Map();
  parsed.FileIndex.forEach((entry, index) => {
    if (entry.type === 2) result.set(parsed.FullPaths[index].slice(parsed.FullPaths[0].length), Buffer.from(entry.content ?? []));
  });
  return result;
}
const paths = fixtureArgs.length ? [fixtureArgs[0].slice(10)] : fixturePaths(execFileSync("git", ["ls-files", "-z"]).toString().split("\0"), { allTracked: true });
if (!paths.length) throw new Error("EmptyFixtureInventory");
const reader = await createHwp5Reader(module), hwpxReader = await createHwpxReader(module), files = [];
try {
  for (const path of paths) {
    const bytes = readFileSync(path);
    let format;
    try { format = detectDocumentFormat(bytes); }
    catch (error) { files.push({ path, status: "format_refused", error: error.message }); continue; }
    if (format === "hwpx") {
      const result = { path }; files.push(result);
      try {
        const preview = hwpxReader.readTextEvents(bytes);
        result.previewParagraphs = preview.paragraphCount;
        result.previewEvents = preview.events.length;
        result.status = "hwpx_edit_audited_separately";
      } catch (error) { result.status = "hwpx_preview_refused"; result.error = error.message; }
      continue;
    }
    const result = { path };
    files.push(result);
    try {
      const preview = reader.readText(bytes);
      result.previewParagraphs = preview.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
    } catch (error) { result.status = "preview_refused"; result.error = error.message; continue; }
    let editor;
    const options = { distribution: Boolean(streams(bytes).get("FileHeader")?.readUInt32LE(36) & 4) };
    try { editor = await createExperimentalHwp5Editor(module, bytes, options); }
    catch (error) { result.status = "editor_open_refused"; result.error = error.message; continue; }
    try {
      const before = streams(bytes), expected = sectionTexts(before);
      const { saved, ...audit } = exerciseEditor(editor, expected, { history });
      Object.assign(result, audit);
      verifySaved(before, streams(saved.bytes), expected);
      if (!audit.edited) assert.deepEqual(Buffer.from(saved.bytes), bytes, "fully refused document must save byte-exact source");
      const reopened = await createExperimentalHwp5Editor(module, saved.bytes, options);
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
} finally { reader.close(); hwpxReader.close(); }
const counts = {};
for (const file of files) counts[file.status] = (counts[file.status] ?? 0) + 1;
const totals = { attempted: 0, edited: 0, ...(history ? { historyVerified: 0 } : {}), failures: {} };
for (const file of files) {
  totals.attempted += file.attempted ?? 0;
  totals.edited += file.edited ?? 0;
  if (history) totals.historyVerified += file.historyVerified ?? 0;
  for (const [error, count] of Object.entries(file.failures ?? {})) totals.failures[error] = (totals.failures[error] ?? 0) + count;
}
console.log(JSON.stringify({ scope: fixtureArgs.length ? "one explicit fixture; every opened HWP5 paragraph" : "all tracked HWP/HWPX including demos; every opened HWP5 paragraph", evidence: "real prefix splice and saved text oracle; not layout/format/UI proof", wasmSha256: createHash("sha256").update(wasmBytes).digest("hex"), history, counts, totals, files }, null, 2));
