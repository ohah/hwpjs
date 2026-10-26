// Diagnostic only: recheck old refused coordinates, never change their source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createHwpxEditor } from '../js/hwpx-editor.mjs';
import { queryPrefixRoute } from './hwpx-prefix-route-query.mjs';
import { writeAuditRow } from './audit-jsonl-output.mjs';

assert(process.env.HWPJS_TEST_WASM && process.argv.length === 3, 'ExplicitRecheckInputsRequired');
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const wasmHash = digest(wasm),
  module = await WebAssembly.compile(wasm);
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(rows.at(-1).kind, 'summary');
const files = rows.filter((row) => row.kind === 'file' && row.refused?.length);
const totals = { files: files.length, coordinates: 0, prefix: 0, formulaResult: 0, refused: 0 };
writeAuditRow({
  kind: 'recheck-start',
  wasmHash,
  files: files.length,
  scope: 'old refused coordinates only; query proof, not all current paragraphs or actual edits',
});
for (const row of files) {
  const input = readFileSync(row.path);
  assert.equal(digest(input), row.inputSha256, 'OldCoordinateSourceChanged');
  const editor = await createHwpxEditor(module);
  try {
    editor.open(input);
    for (const point of row.refused) {
      let route = null,
        prefixError = null,
        targets = [],
        formulaError = null;
      try {
        route = queryPrefixRoute(editor, point.section, point.paragraph);
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'Error') throw error;
        prefixError = error.message;
      }
      if (route === null) {
        try {
          targets = editor.manualFormulaResultTargets(point.section, point.paragraph);
        } catch (error) {
          if (!(error instanceof Error) || error.name !== 'Error') throw error;
          formulaError = error.message;
        }
      }
      const status = route !== null ? 'prefix' : targets.length ? 'formulaResult' : 'refused';
      totals.coordinates++;
      totals[status]++;
      writeAuditRow({
        kind: 'coordinate',
        path: row.path,
        inputSha256: row.inputSha256,
        ...point,
        status,
        route,
        prefixError,
        targets,
        formulaError,
      });
    }
    assert.deepEqual(Buffer.from(editor.save()), input, 'QueriesChangedSavedInput');
  } finally {
    editor.close();
  }
  assert.equal(digest(readFileSync(row.path)), row.inputSha256);
}
assert.equal(totals.coordinates, totals.prefix + totals.formulaResult + totals.refused);
assert.equal(digest(readFileSync(process.env.HWPJS_TEST_WASM)), wasmHash);
writeAuditRow({ kind: 'recheck-summary', wasmHash, ...totals });
