// Original fixtures are read-only; each successful attempt is undone before the next.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fixturePaths } from "./hwp5-edit-corpus-lib.mjs";
import { createExperimentalHwp5Editor } from "../js/hwp5-editor.mjs";
import { verifySplit } from "../tests/hwp5/style-preservation/structure-record-oracle.mjs";

const module = await WebAssembly.compile(readFileSync("zig-out/bin/hwpjs.wasm"));
const paths = fixturePaths(execFileSync("git", ["ls-files", "-z"]).toString().split("\0")).filter(p => /\.hwp$/i.test(p));
assert(paths.length, "EmptyFixtureInventory");
const totals = { attempted: 0, verified: 0, refusals: {}, openRefusals: {}, verificationFailures: [] };
for (const path of paths) {
  const bytes = readFileSync(path);
  let editor;
  try { editor = await createExperimentalHwp5Editor(module, bytes); }
  catch (error) { totals.openRefusals[error.message] = (totals.openRefusals[error.message] ?? 0) + 1; continue; }
  try {
    editor.enableHistory();
    let expectedRedo = null;
    for (let section = 0; section < editor.sectionCount(); section++) {
      const count = editor.paragraphCount(section);
      for (let paragraph = 0; paragraph < count; paragraph++) {
        const text = editor.text(section, paragraph), end = Math.max(0, text.length - 1);
        for (const atUnit of new Set([0, Math.floor(end / 2), end])) {
          totals.attempted++;
          try { editor.splitParagraph({ section, paragraph, atUnit }); }
          catch (error) {
            totals.refusals[error.message] = (totals.refusals[error.message] ?? 0) + 1;
            assert.deepEqual(Buffer.from(editor.save().bytes), bytes, `${path}: refusal changed source`);
            assert.equal(editor.redo(), expectedRedo !== null, `${path}: refusal changed redo availability`);
            if (expectedRedo !== null) {
              assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, expectedRedo, `${path}: refusal changed redo values`);
              assert.equal(editor.undo(), true);
            }
            continue;
          }
          const saved = editor.save({ allowStaleLayout: true }).bytes;
          verifySplit(bytes, saved, section, paragraph, atUnit);
          assert.equal(editor.paragraphCount(section), count + 1);
          assert.equal(editor.undo(), true);
          assert.deepEqual(Buffer.from(editor.save().bytes), bytes);
          assert.equal(editor.redo(), true);
          assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
          assert.equal(editor.undo(), true);
          expectedRedo = saved;
          totals.verified++;
        }
      }
    }
  } catch (error) {
    totals.verificationFailures.push({ path, error: error.message }); process.exitCode = 1;
  } finally { editor.close(); }
}
console.log(JSON.stringify({ scope: "tracked HWP paragraphs at beginning/middle/end; independent whole records and streams; native history; not full controls or layout", files: paths.length, ...totals }, null, 2));
