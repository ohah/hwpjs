// Exhaust actual plain permissions; no claim that a successful query is an edit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { trackedHwpxFiles } from "./hwpx-corpus-files.mjs";
import { executeOracle } from "./oracle-process-async.mjs";
import { writeAuditRow } from "./audit-jsonl-output.mjs";
assert(
  process.env.HWPJS_TEST_WASM && process.argv.length === 2,
  "ExplicitPlainProbeInputsRequired",
);
const wasm = readFileSync(process.env.HWPJS_TEST_WASM),
  digest = (b) => createHash("sha256").update(b).digest("hex");
const wasmHash = digest(wasm),
  editor = await createHwpxEditor(wasm),
  paths = trackedHwpxFiles();
const oracleHash = digest(readFileSync(new URL("./hwpx-anchor-prefix-oracle.py", import.meta.url)));
const sourceHash = digest(readFileSync(new URL(import.meta.url)));
const numericCoordinates = new Set([
  20, 21, 22, 23, 26, 27, 28, 29, 32, 33, 34, 35, 61, 62, 63, 64, 67, 68, 69, 70, 73, 74, 75, 76,
  112, 113, 114, 115, 118, 119, 120, 121, 124, 125, 126, 127, 153, 154, 155, 156, 159, 160, 161,
  162, 165, 166, 167, 168,
]);
const totals = {
  files: paths.length,
  encrypted: 0,
  queried: 0,
  plain: 0,
  edited: 0,
  reopened: 0,
  numericRefusals: 0,
};
let reopener;
const marker = "본문전수😀<&";
writeAuditRow({
  kind: "plain-edit-start",
  wasmHash,
  oracleHash,
  sourceHash,
  marker,
  files: paths.length,
});
try {
  reopener = await createHwpxEditor(wasm);
  for (const path of paths) {
    const input = readFileSync(path),
      original = Buffer.from(input),
      inputHash = digest(input);
    let opened;
    try {
      opened = editor.open(input);
    } catch (error) {
      if (error.message !== "EncryptedDocument" || !path.endsWith("/password-12345.hwpx"))
        throw error;
      assert.deepEqual(input, original);
      assert.equal(digest(readFileSync(path)), inputHash);
      totals.encrypted++;
      writeAuditRow({ kind: "encrypted", path, inputHash });
      continue;
    }
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 8 * 1024 * 1024 });
    let lastSaved = null;
    for (let section = 0; section < opened.sectionCount; section++) {
      const rows = editor.paragraphTextSnapshot(section);
      assert(rows.length);
      const first = rows[0].paragraph;
      for (const row of rows) {
        totals.queried++;
        if (!editor.canEdit(section, row.paragraph)) continue;
        totals.plain++;
        const revision = editor.historyRevision();
        try {
          editor.splice(section, row.paragraph, 0, 0, marker);
        } catch (error) {
          assert.equal(error.message, "InvalidFormulaNumber", "UnexpectedPlainMutationRefusal");
          assert(
            path.endsWith("/chart.hwpx") && section === 0 && numericCoordinates.has(row.paragraph),
            "UnexpectedNumericCoordinate",
          );
          assert.equal(editor.historyRevision(), revision);
          assert.deepEqual(Buffer.from(editor.save()), input);
          if (lastSaved) {
            assert.equal(editor.redo(), true);
            assert.deepEqual(Buffer.from(editor.save()), lastSaved);
            assert.equal(editor.undo(), true);
            assert.deepEqual(Buffer.from(editor.save()), input);
          }
          totals.numericRefusals++;
          writeAuditRow({
            kind: "numeric-refusal",
            path,
            section,
            paragraph: row.paragraph,
            inputHash,
          });
          continue;
        }
        const saved = Buffer.from(editor.save());
        assert.notDeepEqual(saved, input);
        const request = {
          before: input.toString("base64"),
          after: saved.toString("base64"),
          section,
          paragraph: row.paragraph - first + 1,
          text: marker,
          mode: "plain_text",
        };
        try {
          for (const flags of [[], ["-O"]])
            await executeOracle("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
              input: JSON.stringify(request),
              timeout: 30000,
              maxBuffer: 32 * 1024 * 1024,
            });
        } catch (error) {
          writeAuditRow({
            kind: "oracle-failure",
            path,
            section,
            paragraph: row.paragraph,
            localParagraph: request.paragraph,
            errorCode: error.code,
            error: String(error.stderr ?? error),
          });
          throw error;
        }
        reopener.open(saved);
        const reopened = reopener
          .paragraphTextSnapshot(section)
          .find((candidate) => candidate.paragraph === row.paragraph);
        assert(reopened, "ReopenedParagraphMissing");
        assert.equal(reopened.text, marker + row.text, "ReopenedParagraphTextChanged");
        assert.deepEqual(Buffer.from(reopener.save()), saved, "ReopenedDocumentResaveChanged");
        totals.reopened++;
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save()), input);
        assert.equal(editor.redo(), true);
        assert.deepEqual(Buffer.from(editor.save()), saved);
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save()), input);
        lastSaved = saved;
        totals.edited++;
        writeAuditRow({
          kind: "plain-edited",
          path,
          section,
          paragraph: row.paragraph,
          inputHash,
          savedHash: digest(saved),
          reopened: true,
        });
      }
    }
    assert.deepEqual(input, original);
    assert.equal(digest(readFileSync(path)), inputHash);
  }
  assert.equal(totals.queried, 1444);
  assert.equal(totals.plain, 1278);
  assert.equal(totals.edited + totals.numericRefusals, totals.plain);
  assert.equal(totals.numericRefusals, numericCoordinates.size);
  assert.equal(totals.encrypted, 1);
  assert.equal(totals.reopened, totals.edited);
  assert.equal(digest(readFileSync(process.env.HWPJS_TEST_WASM)), wasmHash);
  assert.equal(
    digest(readFileSync(new URL("./hwpx-anchor-prefix-oracle.py", import.meta.url))),
    oracleHash,
  );
  assert.equal(digest(readFileSync(new URL(import.meta.url))), sourceHash);
  writeAuditRow({ kind: "plain-edit-summary", wasmHash, oracleHash, sourceHash, ...totals });
} finally {
  try {
    reopener?.close();
  } finally {
    editor.close();
  }
}
