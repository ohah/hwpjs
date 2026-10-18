// Explicit native result routes; no fixture writes or fallback to another position.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";
import { hwpxParagraphCoordinates } from "./hwpx-paragraph-coordinates.mjs";
import { parseEditAuditOptions } from "./hwpx-edit-audit-options.mjs";
import { trackedHwpxFiles } from "./hwpx-corpus-files.mjs";
import { execFileSync } from "./oracle-process.mjs";

const options = parseEditAuditOptions(process.argv.slice(2), { requireWasm: true });
const wasm = readFileSync(options.wasm), digest = value => createHash("sha256").update(value).digest("hex");
const wasmSha256 = digest(wasm);
const module = await WebAssembly.compile(wasm);
const editor = await createHwpxEditor(module), reader = await createHwpxReader(module);
const refused = new Set(["UnsupportedStructuralFieldEdit", "UnsupportedParagraphControl", "UnsupportedAnchoredStructure", "UnsupportedInlineControl", "UnsupportedFormulaResultStructure"]);
const totals = { files: 0, fields: 0, verified: 0, refusals: {}, failures: 0 };
console.log(JSON.stringify({ kind: "start", wasmSha256, scope: options.fixture ? "one explicit fixture; every native source formula" : "tracked HWPX fixtures; every native source formula" }));
try {
  for (const path of options.fixture ? [options.fixture] : trackedHwpxFiles()) {
    totals.files++;
    const input = readFileSync(path), inputHash = digest(input);
    editor.open(input);
    editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 16 * 1024 * 1024 });
    const rows = hwpxParagraphCoordinates(reader.readTextEvents(input).events);
    const inventory = JSON.parse(execFileSync("python3", ["tools/hwpx-manual-result-inventory.py"], { input, encoding: "utf8", timeout: 30000 }));
    assert(inventory.every(entry => rows.some(row => row.section === entry.section && row.localParagraph === entry.localParagraph)), "IndependentFormulaParagraphMissing");
    for (const section of new Set(rows.map(row => row.section))) {
      const sources = editor.formulaSources(section);
      const observed = inventory.filter(entry => entry.section === section);
      assert.equal(sources.length, observed.length, "IndependentFormulaInventoryMismatch");
      if (!sources.length) continue;
      const targets = new Map();
      // Independent XML identifies candidate paragraphs; native API still grants ownership.
      const paragraphs = new Set(observed.map(entry => entry.localParagraph));
      for (const row of rows.filter(row => row.section === section && paragraphs.has(row.localParagraph))) {
        for (const target of editor.manualFormulaResultTargets(section, row.paragraph)) {
          assert(!targets.has(target.beginElement), "AmbiguousNativeResultOwner");
          targets.set(target.beginElement, { row, target });
        }
      }
      for (const [ordinal, source] of sources.entries()) {
        totals.fields++;
        const result = { kind: "field", path, inputSha256: inputHash, section, ordinal, beginElement: source.begin_element };
        const revision = editor.historyRevision();
        let applied = false;
        try {
          // Never infer ownership from source text or a coincidental matching number.
          const { row: targetRow, target } = targets.get(source.begin_element) ?? {};
          if (!target) {
            // Exercise the setter too: a missing query target is not sufficient refusal proof.
            assert.throws(() => editor.setManualFormulaResult(section, source.begin_element, "감사😀<&"), error => refused.has(error.message));
            result.status = "native_result_route_refused";
            totals.refusals[result.status] = (totals.refusals[result.status] ?? 0) + 1;
            assert.equal(editor.historyRevision(), revision);
            assert.deepEqual(Buffer.from(editor.save()), input);
          } else {
            const original = editor.manualFormulaResultDisplayText(section, targetRow.paragraph);
            const display = "감사😀<&" + original.slice(target.start, target.end);
            editor.spliceManualFormulaResult(section, source.begin_element, 0, 0, "감사😀<&");
            applied = true;
            const saved = Buffer.from(editor.save());
            for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-manual-result-save-oracle.py"], {
              input: JSON.stringify({ before: input.toString("base64"), after: saved.toString("base64"), section, ordinal, display }), timeout: 30000,
            });
            assert.deepEqual(editor.formulaSources(section), sources, "SourceFormulaCacheChanged");
            assert.equal(editor.manualFormulaResultDisplayText(section, targetRow.paragraph), original.slice(0, target.start) + display + original.slice(target.end));
            const reopened = await createHwpxEditor(module);
            try {
              reopened.open(saved);
              assert.deepEqual(Buffer.from(reopened.save()), saved);
              assert.equal(reopened.manualFormulaResultDisplayText(section, targetRow.paragraph), original.slice(0, target.start) + display + original.slice(target.end));
            } finally { reopened.close(); }
            assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
            assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
            assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
            result.status = "prefix_xml_reopen_history_verified";
            totals.verified++;
          }
        } catch (error) {
          result.status = "verification_failed"; result.error = error.message;
          totals.failures++; process.exitCode = 1;
          if (!applied) {
            assert.equal(editor.historyRevision(), revision, "RejectedResultChangedHistory");
            assert.deepEqual(Buffer.from(editor.save()), input, "RejectedResultChangedDocument");
            result.failedEditStatePreserved = true;
          }
          // Start subsequent independent fields from the original, not a failed transaction.
          editor.open(input); editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 16 * 1024 * 1024 });
        }
        assert.equal(digest(input), inputHash);
        assert.equal(digest(readFileSync(path)), inputHash);
        console.log(JSON.stringify(result));
      }
    }
    assert.equal(digest(input), inputHash, "AuditInputBufferChanged");
    assert.equal(digest(readFileSync(path)), inputHash, "AuditInputChanged");
  }
} finally { editor.close(); reader.close(); }
assert.equal(digest(wasm), wasmSha256, "AuditArtifactBufferChanged");
assert.equal(digest(readFileSync(options.wasm)), wasmSha256, "AuditArtifactChanged");
console.log(JSON.stringify({ kind: "summary", wasmSha256, ...totals, scope: "manual formula result prefix XML ZIP reopening and history only; refusals are not support; not all edits or layout" }));
