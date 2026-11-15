import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createHwp5Reader } from '../../js/hwp5.mjs';
import { displayContent } from '../../web/preview/content.mjs';
import { attachHwp5EquationRendering } from '../../web/preview/hwp5-equation-content.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
assert.ok(process.env.HWPJS_TEST_WASM, 'ExplicitCandidateRequired');
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
const module = await WebAssembly.compile(wasm);
assert.deepEqual(WebAssembly.Module.imports(module), []);
const exports = new Set(WebAssembly.Module.exports(module).map((e) => e.name));
for (const name of ['hwp5_edit_equation_snapshot', 'hwp5_edit_equation_sites'])
  assert.ok(exports.has(name));
const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/latex.hwp');
const editor = await createExperimentalHwp5Editor(module, input);
const reader = await createHwp5Reader(module);
let reopened;
try {
  editor.enableHistoryV2();
  assert.equal(editor.supportsEquationSources(), true);
  const before = editor.save({ allowStaleLayout: true }).bytes;
  const stats = editor.historyStats(),
    revision = editor.historyRevision();
  const snapshots = [];
  for (let section = 0; section < editor.sectionCount(); section++) {
    const rows = editor.equationSnapshot(section);
    assert.equal(rows.length, editor.equationSites(section).length);
    for (const row of rows) assert.equal(row.layout, 'version-only');
    snapshots.push(rows);
  }
  assert.ok(snapshots.flat().length > 0);
  const selected = snapshots[0][0];
  assert.deepEqual(editor.equationSource(0, selected.site.equationNode), selected);
  assert.throws(() => editor.equationSource(0, 0xffffffff), /InvalidEquationNode/);
  const content = displayContent(reader.readText(input));
  // Real native layout with controlled font metrics; not browser font evidence.
  const context = {
    save() {},
    restore() {},
    measureText(text) {
      return { width: text.length * 8, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 };
    },
  };
  attachHwp5EquationRendering(editor, content, () => context);
  assert.deepEqual(content.equationErrors, []);
  const anchors = content.paragraphs.reduce((sum, row) => sum + row.equations.length, 0);
  const paints = content.paragraphs.reduce((sum, row) => sum + row.equationPaint.length, 0);
  assert.equal(anchors, snapshots.flat().length);
  assert.ok(paints > 0, 'AtLeastOneRealNativeEquationLayoutRequired');
  assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, before);
  assert.deepEqual(editor.historyStats(), stats);
  assert.equal(editor.historyRevision(), revision);
  reopened = await createExperimentalHwp5Editor(module, before);
  for (let section = 0; section < snapshots.length; section++)
    assert.deepEqual(reopened.equationSnapshot(section), snapshots[section]);
  assert.throws(() => editor.equationSnapshot(editor.sectionCount()), /InvalidSection/);
  const result = {
    status: 'PASS',
    wasmSha256: sha(wasm),
    wasmBytes: wasm.length,
    exports: exports.size,
    sourceSha256: sha(input),
    sections: snapshots.length,
    anchors,
    actualNativeLayoutsWithControlledFontMetrics: paints,
    paintErrors: content.equationPaintErrors,
    savedBytesAndHistoryUnchanged: true,
    savedReopenSnapshotExact: true,
    noBrowserOrPublicSdkClaim: true,
  };
  if (process.env.HWPJS_TEST_RESULT)
    writeFileSync(process.env.HWPJS_TEST_RESULT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  reopened?.close();
  editor.close();
  reader.close();
}
assert.throws(() => editor.equationSnapshot(0), /EditorClosed/);
