// Product WASM coverage, not an independent XML/ZIP oracle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { trackedHwpxFiles } from "./hwpx-corpus-files.mjs";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";
import { parseEditAuditOptions } from "./hwpx-edit-audit-options.mjs";
import { execFileSync } from "./oracle-process.mjs";
import { hwpxParagraphCoordinates } from "./hwpx-paragraph-coordinates.mjs";
import { captureInputIdentity, verifyInputIdentity } from "./audit-input-identity.mjs";

const options = parseEditAuditOptions(process.argv.slice(2), { allowHistory: true });
const wasm = readFileSync(options.wasm ?? "zig-out/bin/hwpjs.wasm");
const history = options.history ?? false;
const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
const paths = options.fixture !== undefined ? [options.fixture] : trackedHwpxFiles();
assert(paths.length > 0, "EmptyFixtureInventory");
console.log(JSON.stringify({ kind: "start", scope: options.fixture !== undefined ? "one explicit HWPX fixture; every paragraph prefix" : "all tracked HWPX files; every paragraph prefix", files: paths.length, wasmSha256: createHash("sha256").update(wasm).digest("hex"), evidence: "product projection and saved history; not independent XML or browser proof" }));
const counts = { files: paths.length, encrypted: 0, paragraphs: 0, accepted: 0, refused: {}, history, restored: 0, refusalRedoPreserved: 0 };
try {
  for (const path of paths) {
    const input = readFileSync(path);
    const inputIdentity = captureInputIdentity(input);
    try { editor.open(input); }
    catch (error) {
      if (error.message !== "EncryptedDocument") throw error;
      verifyInputIdentity(input, inputIdentity, path);
      counts.encrypted++; continue;
    }
    if (history) editor.enableHistory();
    const original = reader.readTextEvents(input);
    const paragraphs = hwpxParagraphCoordinates(original.events);
    let formulaPrefixes;
    let accepted = 0;
    let previousEdited = null;
    for (const paragraph of paragraphs) {
      counts.paragraphs++;
      const eligible = editor.canEdit(paragraph.section, paragraph.paragraph);
      const outsideEligible = !eligible && editor.canEditOutsideField(paragraph.section, paragraph.paragraph, 0, 0);
      const priorRevision = history ? editor.historyRevision() : null;
      try { editor.splice(paragraph.section, paragraph.paragraph, 0, 0, "검증😀<&\r"); }
      catch (error) {
        if (history) assert.equal(editor.historyRevision(), priorRevision, `${path}: refused command changed revision`);
        if (error.message === "InvalidFormulaNumber") {
          // Editable numeric cells still reject this deliberately nonnumeric
          // prefix. Structural eligibility is not permission for every value.
          assert.equal(eligible, true, path);
        } else if (error.message === "ProtectedFieldRange") {
          assert.equal(eligible, false, path);
          assert.equal(outsideEligible, false, path);
          const namedField = editor.fieldLabels(paragraph.section, paragraph.paragraph).some(label => label.start === 0);
          if (!namedField) {
            formulaPrefixes ??= JSON.parse(execFileSync("python3", ["tools/hwpx-formula-prefix-inventory.py", path], { encoding: "utf8", timeout: 30000 }));
            assert(formulaPrefixes.some(row => row.section === paragraph.section && row.localParagraph === paragraph.localParagraph), `${path}: protected prefix without source field at zero`);
          }
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
      assert(eligible || outsideEligible, `${path}: successful prefix without eligible plain or field-exterior range`);
      const saved = editor.save();
      const reopened = reader.readTextEvents(saved);
      const text = reopened.events.filter(event => event.kind === "content" && event.section === paragraph.section && event.paragraph === paragraph.paragraph).map(event => event.value).join("");
      const before = original.events.filter(event => event.kind === "content" && event.section === paragraph.section && event.paragraph === paragraph.paragraph).map(event => event.value).join("");
      assert.equal(text, `검증😀<&\r${before}`, `${path}: ${paragraph.paragraph}`);
      if (history) {
        const editedRevision = editor.historyRevision();
        assert(editedRevision > priorRevision, `${path}: changed command did not get a fresh revision`);
        assert.equal(editor.redo(), false, path);
        assert.equal(editor.historyRevision(), editedRevision, `${path}: empty redo changed revision`);
        assert.equal(editor.undo(), true, path);
        assert.equal(editor.historyRevision(), priorRevision, `${path}: undo revision mismatch`);
        assert.deepEqual(Buffer.from(editor.save()), input, path);
        assert.equal(editor.redo(), true, path);
        assert.equal(editor.historyRevision(), editedRevision, `${path}: redo revision mismatch`);
        assert.deepEqual(editor.save(), saved, path);
        assert.equal(editor.undo(), true, path);
        assert.equal(editor.historyRevision(), priorRevision, `${path}: final undo revision mismatch`);
        previousEdited = saved;
        counts.restored++;
      } else editor.splice(paragraph.section, paragraph.paragraph, 0, 7, "");
      assert.deepEqual(Buffer.from(editor.save()), input, path);
      counts.accepted++; accepted++;
    }
    verifyInputIdentity(input, inputIdentity, path);
    console.log(JSON.stringify({ path, inputSha256: inputIdentity, paragraphs: paragraphs.length, accepted }));
  }
  if (options.fixture === undefined) assert.equal(counts.encrypted, paths.filter(path => path.endsWith("/password-12345.hwpx")).length);
  assert.equal(counts.paragraphs, counts.accepted + Object.values(counts.refused).reduce((sum, value) => sum + value, 0), "Paragraph classification mismatch");
  console.log(JSON.stringify({ totals: counts }));
} finally { editor.close(); reader.close(); }
