// Full explicit inventory; queries are not actual edits or layout proof.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { referenceHwpxFiles } from "./reference-hwpx-files.mjs";
import { referenceReaderScope } from "./reference-reader-scope.mjs";
import { captureInputIdentity, verifyInputIdentity } from "./audit-input-identity.mjs";
import { hwpxParagraphCoordinates } from "./hwpx-paragraph-coordinates.mjs";
import { queryPrefixRoute } from "./hwpx-prefix-route-query.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";

const options = {};
for (const argument of process.argv.slice(2)) {
  const match = /^--(wasm|root)=(.+)$/.exec(argument);
  if (!match) throw new Error("UnknownAuditArgument");
  if (options[match[1]] !== undefined) throw new Error("DuplicateAuditArgument");
  options[match[1]] = match[2];
}
if (!options.wasm || !options.root) throw new Error("MissingAuditScope");
const wasm = readFileSync(options.wasm), wasmSha256 = captureInputIdentity(wasm);
const files = referenceHwpxFiles(options.root);
const module = await WebAssembly.compile(wasm), reader = await createHwpxReader(module);
const totals = { files: files.length, queried: 0, otherFormat: 0, failedFiles: 0, paragraphs: 0, routes: { plain: 0, anchored: 0, field: 0 }, refused: 0 };
console.log(JSON.stringify({ kind: "start", root: options.root, files: files.length, wasmSha256, scope: "all regular .hwpx paths; signature-selected HWPX; query-only prefix eligibility" }));
try {
  for (const path of files) {
    let editor, input, inputSha256;
    const result = { path, routes: { plain: 0, anchored: 0, field: 0 }, refused: [] };
    try {
      if (statSync(path).size > 64 * 1024 * 1024) throw new Error("AuditInputBudgetExceeded");
      input = readFileSync(path); inputSha256 = captureInputIdentity(input);
      const selected = referenceReaderScope(input);
      result.format = selected.format;
      if (selected.format !== "hwpx") { result.status = "other_format"; totals.otherFormat++; }
      else {
        const events = reader.readTextEvents(input), coordinates = hwpxParagraphCoordinates(events.events);
        assert.equal(coordinates.length, events.paragraphCount);
        editor = await createHwpxEditor(module); editor.open(input);
        for (const row of coordinates) {
          try {
            const route = queryPrefixRoute(editor, row.section, row.paragraph);
            assert(Object.hasOwn(result.routes, route), "InvalidPrefixRoute");
            result.routes[route]++;
          } catch (error) {
            if (error.code === "ERR_ASSERTION") throw error;
            result.refused.push({ ...row, error: error.message });
          }
        }
        assert.deepEqual(Buffer.from(editor.save()), input, "query changed saved source");
        result.paragraphs = coordinates.length; result.status = "queried"; totals.queried++;
        totals.paragraphs += coordinates.length; totals.refused += result.refused.length;
        for (const route of Object.keys(totals.routes)) totals.routes[route] += result.routes[route];
      }
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
      result.status = "file_refused"; result.error = error.message; totals.failedFiles++;
    } finally {
      editor?.close();
      if (input) verifyInputIdentity(input, inputSha256, path);
      verifyInputIdentity(wasm, wasmSha256, options.wasm);
    }
    console.log(JSON.stringify({ kind: "file", inputSha256, ...result }));
  }
} finally { reader.close(); }
assert.equal(totals.queried + totals.otherFormat + totals.failedFiles, totals.files);
assert.equal(Object.values(totals.routes).reduce((sum, value) => sum + value, 0) + totals.refused, totals.paragraphs);
console.log(JSON.stringify({ kind: "summary", wasmSha256, ...totals, scope: "prefix queries only; other signatures are not HWPX success; no actual edits/browser/layout proof" }));
process.exitCode = totals.failedFiles || totals.refused ? 1 : 0;
