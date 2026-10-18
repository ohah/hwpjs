// Specialized prefix routes complement, never replace, the plain-input audit.
import assert from "node:assert/strict";
import { hwpxParagraphCoordinates } from "./hwpx-paragraph-coordinates.mjs";
import { readFileSync } from "node:fs";
import { trackedHwpxFiles } from "./hwpx-corpus-files.mjs";
import { insertPrefix } from "./hwpx-prefix-edit-probe.mjs";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";
import { execFileSync } from "./oracle-process.mjs";
import { parseEditAuditOptions } from "./hwpx-edit-audit-options.mjs";
import { createHash } from "node:crypto";
import { verifyRefusalHistory } from "./hwpx-refusal-history.mjs";
import { captureInputIdentity, verifyInputIdentity } from "./audit-input-identity.mjs";
import { selectFieldPrefixOracle } from "./hwpx-field-prefix-oracle.mjs";

const options = parseEditAuditOptions(process.argv.slice(2), { requireWasm: true });
const wasm = readFileSync(options.wasm);
console.log(JSON.stringify({ kind: "start", scope: options.fixture !== undefined ? "one explicit fixture; specialized prefix routes" : "all tracked fixtures; specialized prefix routes", wasmSha256: createHash("sha256").update(wasm).digest("hex") }));
const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
const totals = { files: 0, encrypted: 0, attempts: 0, verified: 0, xmlVerified: 0, xmlFieldVerified: 0, refused: {}, examples: [] };
const allowedRefusals = new Set(["UnsupportedFieldLabelRange", "UnsupportedFieldLabel", "UnsupportedParagraphControl", "UnsupportedInlineControl", "MissingTextSite", "ProtectedFieldRange", "UnsupportedAnchoredStructure", "UnsupportedTextPositionProjection"]);
const text = (projection, section, paragraph) => projection.events.filter(e => e.kind === "content" && e.section === section && e.paragraph === paragraph).map(e => e.value).join("");
try {
  for (const path of options.fixture !== undefined ? [options.fixture] : trackedHwpxFiles()) {
    totals.files++;
    const input = readFileSync(path);
    const inputIdentity = captureInputIdentity(input);
    try { editor.open(input); }
    catch (error) {
      if (error.message !== "EncryptedDocument") throw error;
      verifyInputIdentity(input, inputIdentity, path);
      totals.encrypted++;
      continue;
    }
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
    const original = reader.readTextEvents(input);
    let previousEdited = null;
    for (const p of hwpxParagraphCoordinates(original.events)) {
      if (editor.canEdit(p.section, p.paragraph) || editor.canEditOutsideField(p.section, p.paragraph, 0, 0)) continue;
      totals.attempts++;
      let anchored = false;
      let anchorError = null;
      try { editor.anchorText(p.section, p.paragraph); anchored = true; }
      catch (error) {
        anchorError = error.message;
        assert(["UnsupportedParagraphControl", "UnsupportedInlineControl", "MissingTextSite", "SourceBindingMismatch", "UnsupportedFieldLabel", "UnsupportedStructuralFieldEdit"].includes(error.message));
      }
      const revision = editor.historyRevision();
      let fieldTarget = null;
      try {
        fieldTarget = typeof editor.fieldRangeTarget === "function" ? editor.fieldRangeTarget(p.section, p.paragraph, 0, 0) : null;
        insertPrefix(editor, p.section, p.paragraph, "경로😀<&");
      }
      catch (error) {
        assert(allowedRefusals.has(error.message), `${path}/${p.paragraph}: unexpected ${error.message}`);
        verifyRefusalHistory(editor, { original: input, previousEdited, revision, context: `${path}/${p.section}/${p.paragraph}` });
        totals.refused[error.message] = (totals.refused[error.message] ?? 0) + 1;
        if (totals.examples.length < 20) totals.examples.push({ path, section: p.section, paragraph: p.paragraph, error: error.message, anchorError });
        continue;
      }
      const saved = editor.save();
      if (anchored && fieldTarget === null) {
        try {
          for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify({ mode: "anchored", before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), section: p.section, paragraph: p.localParagraph, text: "경로😀<&" }), encoding: "utf8", timeout: 30000 });
        } catch (error) { throw new Error(`${path}/${p.section}/${p.paragraph}: XML oracle failed`, { cause: error }); }
        totals.xmlVerified++;
      } else {
        const { oracle, beginId } = selectFieldPrefixOracle({ before: input.toString("base64"), section: p.section, paragraph: p.localParagraph, beginElement: fieldTarget?.beginElement ?? null });
        for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, oracle], { input: JSON.stringify({ mode: "prefix", before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), beginId, section: p.section, paragraph: p.localParagraph, text: "경로😀<&" }), encoding: "utf8", timeout: 30000 });
        totals.xmlVerified++;
        totals.xmlFieldVerified++;
      }
      assert.equal(text(reader.readTextEvents(saved), p.section, p.paragraph), "경로😀<&" + text(original, p.section, p.paragraph));
      const reopened = await createHwpxEditor(wasm);
      try {
        reopened.open(saved);
        assert.deepEqual(reopened.save(), saved);
      } finally { reopened.close(); }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save(), saved);
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      previousEdited = Buffer.from(saved);
      totals.verified++;
    }
    verifyInputIdentity(input, inputIdentity, path);
  }
  console.log(JSON.stringify(totals, null, 2));
} finally { editor.close(); reader.close(); }
