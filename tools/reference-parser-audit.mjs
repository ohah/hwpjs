// Read-only corpus inventory. Reader projection is not full parser/editor/UI proof.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { referenceReaderScope } from "./reference-reader-scope.mjs";
import { createHwp5Reader } from "../js/hwp5.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";

const options = {};
for (const argument of process.argv.slice(2)) {
  const match = /^--(wasm|root)=(.+)$/.exec(argument);
  if (!match) throw new Error(`UnknownAuditArgument: ${argument}`);
  if (options[match[1]] !== undefined) throw new Error("DuplicateAuditArgument");
  options[match[1]] = match[2];
}
const root = options.root ?? "reference/rhwp/samples";
const wasm = readFileSync(options.wasm ?? "zig-out/bin/hwpjs.wasm");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = [];
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (entry.isFile() && /\.(hwp|hwpx)$/i.test(entry.name)) files.push(child);
  }
}
walk(root);
files.sort();
assert(files.length > 0, "EmptyReferenceInventory");
const module = await WebAssembly.compile(wasm);
const hwp = await createHwp5Reader(module),
  hwpx = await createHwpxReader(module);
const counts = {},
  errors = {};
let paragraphs = 0,
  excludedFiles = 0;
console.log(
  JSON.stringify({
    kind: "start",
    root,
    files: files.length,
    wasmSha256: digest(wasm),
    scope:
      "all regular HWP/HWPX paths under explicit root; signature routed text reader; no edits or browser proof",
  }),
);
try {
  for (const path of files) {
    const result = { path, bytes: statSync(path).size };
    try {
      if (result.bytes > 64 * 1024 * 1024) throw new Error("AuditInputBudgetExceeded");
      const bytes = readFileSync(path),
        hash = digest(bytes);
      result.inputSha256 = hash;
      let selected;
      try {
        selected = referenceReaderScope(bytes);
        result.format = selected.format;
      } catch (error) {
        result.status = "format_refused";
        throw error;
      }
      if (!selected.inScope) {
        result.status = "excluded_format";
        result.reason = selected.reason;
        excludedFiles++;
      } else {
        try {
          result.paragraphs =
            result.format === "hwp5"
              ? hwp
                  .readText(bytes)
                  .sections.reduce((sum, section) => sum + section.paragraphs.length, 0)
              : hwpx.readTextEvents(bytes).paragraphCount;
        } finally {
          assert.equal(digest(bytes), hash, "reader mutated input bytes");
        }
        assert(
          Number.isSafeInteger(result.paragraphs) && result.paragraphs >= 0,
          "InvalidParagraphCount",
        );
        result.status = "text_read_verified";
        paragraphs += result.paragraphs;
      }
    } catch (error) {
      if (result.status !== "format_refused") result.status = "reader_refused";
      result.error = error.message;
      errors[result.error] = (errors[result.error] ?? 0) + 1;
    }
    const key = `${result.format ?? "unknown"}:${result.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
    console.log(JSON.stringify({ kind: "file", ...result }));
  }
} finally {
  hwp.close();
  hwpx.close();
}
console.log(
  JSON.stringify({
    kind: "summary",
    root,
    files: files.length,
    inScopeFiles: files.length - excludedFiles,
    excludedFiles,
    paragraphs,
    counts,
    errors,
    wasmSha256: digest(wasm),
    scope:
      "HWP5/HWPX text read and input immutability only; excluded HWP3 is not success or failure; refusals are not success; not full fields/editor/layout support",
  }),
);
