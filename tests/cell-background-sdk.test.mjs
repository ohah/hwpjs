// Mandatory fresh-WASM integration sidecar. No stale fallback and no skip path.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createExperimentalHwp5Editor } from '../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../js/hwpx-editor.mjs';
import { validateCellBackground } from '../js/cell-background-command.mjs';
import {
  inspectCellBackgroundOriginal,
  verifyCellBackgroundSaved,
} from '../tools/tests/cell-background-save-oracle.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const pinnedPath = (name) => {
  const value = process.env[name];
  assert.ok(value && isAbsolute(value), `${name} must name an explicit absolute path`);
  return value;
};
const wasmPath = pinnedPath('HWPJS_TEST_WASM');
assert.match(wasmPath, /\.wasm$/i, 'explicit WASM file only');
const expectedWasmSha = process.env.HWPJS_TEST_WASM_SHA256;
assert.match(expectedWasmSha ?? '', /^[0-9a-f]{64}$/, 'fresh artifact SHA256 is mandatory');
const wasmBytes = readFileSync(wasmPath);
assert.equal(sha(wasmBytes), expectedWasmSha, 'main-granted WASM identity');
const wasmModule = await WebAssembly.compile(wasmBytes);
const exportNames = new Set(
  WebAssembly.Module.exports(wasmModule)
    .filter((e) => e.kind === 'function')
    .map((e) => e.name),
);
for (const name of ['hwpx_edit_set_cell_background', 'hwp5_edit_set_cell_background']) {
  assert.ok(exportNames.has(name), `fresh cell background export required: ${name}`);
}

const manifestPath = pinnedPath('HWPJS_TEST_CELL_BACKGROUND_TARGETS');
assert.match(manifestPath, /\.json$/i, 'explicit target JSON only');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.wasmSha256, expectedWasmSha, 'fixture roster belongs to granted artifact');
assert.ok(
  Array.isArray(manifest.cases) && manifest.cases.length >= 2 && manifest.cases.length <= 12,
);
for (const format of ['hwp5', 'hwpx']) {
  assert.ok(
    manifest.cases.some((c) => c.format === format && c.provenance === 'original-noori'),
    `${format} original Noori case mandatory; derived shared fixtures do not replace it`,
  );
}
const ids = new Set();
for (const c of manifest.cases) {
  assert.match(c.id, /^[a-z0-9-]{1,64}$/);
  assert.ok(!ids.has(c.id), 'duplicate case id');
  ids.add(c.id);
  assert.ok(['hwp5', 'hwpx'].includes(c.format));
  assert.ok(['original-noori', 'controlled-derived-shared'].includes(c.provenance));
  assert.ok(isAbsolute(c.fixturePath));
  assert.match(c.fixturePath, c.format === 'hwp5' ? /\.hwp$/i : /\.hwpx$/i);
  assert.ok(
    !c.fixturePath.includes('/hwpers/') && !c.fixturePath.includes('hwpers_test4'),
    'excluded fixture',
  );
  assert.match(c.fixtureSha256, /^[0-9a-f]{64}$/);
  assert.ok(
    c.target &&
      ['section', 'tableNode', 'listNode'].every(
        (key) =>
          Number.isInteger(c.target[key]) && c.target[key] >= 0 && c.target[key] < 0xffffffff,
      ),
  );
  assert.ok(Number.isInteger(c.sourceRef) && c.sourceRef >= 0);
  assert.ok(['solid', 'none'].includes(c.sourceKind));
  if (c.format === 'hwpx') assert.ok(['rgb24', 'colorref24'].includes(c.target.colorEncoding));
  if (c.provenance === 'controlled-derived-shared') assert.equal(c.requireShared, true);
}
const evidenceParent = resolve('zig-out/verification/cell-border-background-r1/independent');
const evidence = join(
  evidenceParent,
  `run-${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`,
);
mkdirSync(evidence, { recursive: true });
writeFileSync(
  join(evidence, 'input-identity.json'),
  JSON.stringify(
    {
      wasmPath,
      wasmSha256: expectedWasmSha,
      manifestPath,
      manifestSha256: sha(manifestBytes),
      exports: ['hwpx_edit_set_cell_background', 'hwp5_edit_set_cell_background'],
    },
    null,
    2,
  ) + '\n',
);

const COLOR = 0x123456;
async function open(format, input) {
  if (format === 'hwp5') return createExperimentalHwp5Editor(wasmModule, input);
  const editor = await createHwpxEditor(wasmModule);
  try {
    editor.open(input);
    return editor;
  } catch (error) {
    editor.close();
    throw error;
  }
}
function save(format, editor) {
  // Explicit H5 source-preserving/stale-layout policy, not a reflow assertion.
  return Buffer.from(
    format === 'hwp5' ? editor.save({ allowStaleLayout: true }).bytes : editor.save(),
  );
}
function observation(format, editor, target) {
  if (format === 'hwp5') {
    const cells = editor.cellLayoutSources(target.section),
      styles = editor.borderFillSources();
    const selected = cells.filter(
      (r) => r.table_record_node === target.tableNode && r.list_node === target.listNode,
    );
    assert.equal(selected.length, 1, 'live cell owner');
    const ref = selected[0].border_fill_id;
    const style = styles.find((s) => s.id === ref);
    assert.ok(style, 'live resource exists');
    const raw = style.pattern?.background;
    const color =
      raw === undefined ? null : ((raw & 255) << 16) | (raw & 0xff00) | ((raw >>> 16) & 255);
    return { cells, styles, ref, color };
  }
  const report = editor.tableBorderSources(target.section);
  const selected = report.cells.filter(
    (r) => r.table_node === target.tableNode && r.list_node === target.listNode,
  );
  assert.equal(selected.length, 1, 'live cell owner');
  const ref = selected[0].border_fill_id;
  const style = report.styles.find((s) => s.id === ref);
  assert.ok(style, 'live resource exists');
  const faces =
    style.semantic_face_colors ??
    style.semantic_fill_colors?.filter((f) => f.field === 'winBrush.faceColor');
  let color = null;
  if (style.fill_node === null) {
    assert.equal(faces?.length ?? 0, 0, 'source no-fill has no inferred face color');
  } else {
    assert.ok(Array.isArray(faces) && faces.length === 1, 'current canonical face color query');
    color = faces[0].rgb;
  }
  return { cells: report.cells, styles: report.styles, ref, color };
}
function onlySelectedRefChanged(format, before, after, target) {
  assert.equal(after.cells.length, before.cells.length);
  const expected = structuredClone(before.cells);
  const selected = expected.find(
    (c) =>
      (format === 'hwp5' ? c.table_record_node : c.table_node) === target.tableNode &&
      c.list_node === target.listNode,
  );
  selected.border_fill_id = after.ref;
  if (format === 'hwpx') {
    // style_index is a per-report lookup index, not a resource identity.
    for (const c of expected) delete c.style_index;
    const actual = structuredClone(after.cells);
    for (const c of actual) delete c.style_index;
    assert.deepEqual(actual, expected, 'live non-target cells unchanged');
  } else assert.deepEqual(after.cells, expected, 'live non-target cells unchanged');
}

function reachableObjects(value, result = new Set()) {
  if (value !== null && typeof value === 'object' && !result.has(value)) {
    result.add(value);
    for (const child of Object.values(value)) reachableObjects(child, result);
  }
  return result;
}

function assertHxBatchCurrent(editor, target, current, dir, stage) {
  assert.equal(
    typeof editor.tableBorderSourcesBatch,
    'function',
    'Canvas batch query must be present',
  );
  const revision = editor.historyRevision();
  const revisions = editor.historyRevisions();
  const single = editor.tableBorderSources(target.section);
  const batch = editor.tableBorderSourcesBatch([target.section, target.section]);
  // Keep pre-assertion raw results even when the batch path returns stale data.
  writeFileSync(
    join(dir, `batch-${stage}-before-mutation.json`),
    JSON.stringify(
      { single, batch, expectedRef: current.ref, expectedColor: current.color },
      null,
      2,
    ) + '\n',
  );
  assert.equal(batch.length, 2, 'duplicate requests preserve both positions');
  const singleObjects = reachableObjects(single);
  let previousObjects;
  for (const entry of batch) {
    assert.equal(entry.section, target.section);
    assert.equal(Object.hasOwn(entry, 'error'), false, 'batch entry succeeds');
    assert.deepEqual(entry.value, single, 'batch full report equals current single report');
    const cell = entry.value.cells.find(
      (c) => c.table_node === target.tableNode && c.list_node === target.listNode,
    );
    assert.ok(cell, 'batch selected cell owner');
    assert.equal(cell.border_fill_id, current.ref, 'batch current clone reference');
    const style = entry.value.styles.find((s) => s.id === current.ref);
    assert.ok(style, 'batch current resource exists');
    const faces =
      style.semantic_face_colors ??
      style.semantic_fill_colors?.filter((f) => f.field === 'winBrush.faceColor');
    if (current.color === null) {
      assert.equal(style.fill_node, null, 'batch original no-fill has no fill node');
      assert.equal(faces?.length ?? 0, 0, 'batch original no-fill has no inferred color');
    } else {
      assert.ok(Array.isArray(faces) && faces.length === 1);
      assert.equal(faces[0].rgb, current.color, 'batch current canonical color');
    }
    const objects = reachableObjects(entry.value);
    for (const object of objects) {
      assert.ok(!singleObjects.has(object), 'batch and single own distinct nested objects');
      if (previousObjects)
        assert.ok(
          !previousObjects.has(object),
          'duplicate batch reports own distinct nested objects',
        );
    }
    previousObjects = objects;
  }
  const secondSnapshot = structuredClone(batch[1]);
  const first = batch[0].value;
  const selected = first.cells.find(
    (c) => c.table_node === target.tableNode && c.list_node === target.listNode,
  );
  const selectedStyle = first.styles.find((s) => s.id === current.ref);
  selected.border_fill_id = 0xffffffff;
  const faces =
    selectedStyle.semantic_face_colors ??
    selectedStyle.semantic_fill_colors?.filter((f) => f.field === 'winBrush.faceColor');
  if (current.color !== null) faces[0].rgb = 0x654321;
  else {
    assert.ok(selectedStyle.edges[0], 'original no-fill cohort has a real nested edge');
    selectedStyle.edges[0].color = '#654321';
  }
  first.styles.push({ testOnlyMutation: true });
  assert.deepEqual(batch[1], secondSnapshot, 'mutating first report leaves duplicate untouched');
  assert.deepEqual(batch[1].value, single, 'mutating first report leaves single untouched');
  assert.deepEqual(
    editor.tableBorderSourcesBatch([target.section, target.section]),
    [secondSnapshot, secondSnapshot],
    'returned mutation cannot change later Native batch queries',
  );
  assert.deepEqual(
    observation('hwpx', editor, target),
    current,
    'returned mutation cannot change Native single query',
  );
  assert.equal(
    editor.historyRevision(),
    revision,
    'batch read/mutation does not edit Native revision',
  );
  assert.deepEqual(
    editor.historyRevisions(),
    revisions,
    'batch read/mutation does not append history',
  );
}

test('canonical background command has exact color key and RGB24 domain', () => {
  const input = { section: 0, tableNode: 12, listNode: 14, color: COLOR };
  const clean = validateCellBackground(input);
  assert.deepEqual(clean, input);
  assert.ok(Object.isFrozen(clean));
  for (const color of [-1, 0x1000000, NaN, Infinity, 1.5, '1193046']) {
    assert.throws(() => validateCellBackground({ ...input, color }));
  }
  for (const key of ['section', 'tableNode', 'listNode']) {
    assert.equal(validateCellBackground({ ...input, [key]: 0xffffffff })[key], 0xffffffff);
    assert.throws(() => validateCellBackground({ ...input, [key]: 0x100000000 }));
  }
  for (const invalid of [
    null,
    [],
    { ...input, extra: 0 },
    { section: 0, tableNode: 12, listNode: 14, colorRGB24: COLOR },
    { ...input, colorRGB24: COLOR },
    { ...input, [Symbol('extra')]: 0 },
  ]) {
    assert.throws(() => validateCellBackground(invalid));
  }
});

for (const c of manifest.cases) {
  test(
    `${c.id}: current-query / independent saved bytes / reopen / undo1 / redo1`,
    { concurrency: false, timeout: 75_000 },
    async () => {
      const dir = join(evidence, c.id);
      mkdirSync(dir);
      const receipt = {
        id: c.id,
        format: c.format,
        provenance: c.provenance,
        wasmSha256: expectedWasmSha,
        status: 'running',
        checks: [],
      };
      let editor, reopened;
      const mark = (name) => receipt.checks.push(name);
      try {
        const input = readFileSync(c.fixturePath);
        assert.equal(sha(input), c.fixtureSha256, 'pinned original/derived fixture');
        writeFileSync(join(dir, `original.${c.format === 'hwp5' ? 'hwp' : 'hwpx'}`), input);
        const original = inspectCellBackgroundOriginal({
          format: c.format,
          before: input,
          target: c.target,
        });
        receipt.original = original;
        assert.equal(original.sourceRef, c.sourceRef);
        assert.equal(original.sourceKind, c.sourceKind);
        if (c.requireShared === true)
          assert.ok(original.sharedCount >= 2, 'explicit shared cohort only');
        assert.notEqual(original.color, COLOR, 'non-no-op test color');
        editor = await open(c.format, input);
        assert.ok(
          editor
            .tableBindings(c.target.section)
            .some((r) => r.tableNode === c.target.tableNode && r.listNode === c.target.listNode),
          'SDK binding corroborates pinned selector',
        );
        const initial = observation(c.format, editor, c.target);
        assert.equal(initial.ref, original.sourceRef);
        assert.equal(initial.color, original.color);
        assert.deepEqual(save(c.format, editor), input, 'unedited original exact bytes');
        // Native v1 ABI caps entries * checkpoint bytes at 128 MiB.
        editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 8 * 1024 * 1024 });
        const baseRevision = editor.historyRevision(),
          baseRevisions = editor.historyRevisions();
        const command = {
          section: c.target.section,
          tableNode: c.target.tableNode,
          listNode: c.target.listNode,
          color: COLOR,
        };
        editor.setCellBackground(command);
        // Deliberately BEFORE first edited save. Save must not repair stale queries.
        const current = observation(c.format, editor, c.target);
        writeFileSync(
          join(dir, 'current-before-save.json'),
          JSON.stringify(current, null, 2) + '\n',
        );
        assert.equal(current.ref, original.nextRef);
        assert.equal(current.color, COLOR);
        onlySelectedRefChanged(c.format, initial, current, c.target);
        const editRevision = editor.historyRevision(),
          editRevisions = editor.historyRevisions();
        assert.notEqual(editRevision, baseRevision);
        assert.equal(editRevisions.length, baseRevisions.length + 1);
        mark('current-query-before-save');
        if (c.format === 'hwpx') {
          assertHxBatchCurrent(editor, c.target, current, dir, 'edited');
          mark('batch-current-before-save-duplicate-deep-isolation');
        }
        const edited = save(c.format, editor);
        writeFileSync(join(dir, `edited.${c.format === 'hwp5' ? 'hwp' : 'hwpx'}`), edited);
        receipt.savedSha256 = sha(edited);
        receipt.oracle = verifyCellBackgroundSaved({
          format: c.format,
          before: input,
          after: edited,
          target: c.target,
          color: COLOR,
          expectedRef: original.nextRef,
        });
        mark('independent-saved-bytes');
        if (c.format === 'hwpx' && c.sourceKind === 'none') {
          assert.equal(
            receipt.oracle.encodedFaceColor,
            '#563412',
            'Noori COLORREF representation of requested RGB',
          );
          assert.equal(
            receipt.oracle.newCloneHatchColorPresent,
            false,
            'HX no-fill construction does not fabricate foreground',
          );
          mark('hx-none-cow-requested-color-without-foreground-fabrication');
        }
        for (const wrong of [
          { color: 0x654321, expectedRef: original.nextRef },
          { color: COLOR, expectedRef: original.nextRef + 1 },
        ]) {
          assert.throws(
            () =>
              verifyCellBackgroundSaved({
                format: c.format,
                before: input,
                after: edited,
                target: c.target,
                ...wrong,
              }),
            'oracle must reject wrong expected color/ref',
          );
        }
        mark('oracle-wrong-color-and-reference-rejected');
        editor.setCellBackground(command);
        assert.equal(editor.historyRevision(), editRevision, 'no-op revision');
        assert.deepEqual(editor.historyRevisions(), editRevisions, 'no-op history entries');
        assert.deepEqual(observation(c.format, editor, c.target), current, 'no-op current query');
        assert.deepEqual(save(c.format, editor), edited, 'no-op saved bytes');
        mark('native-noop-revision-and-bytes');
        for (const [name, invalid] of [
          ['section-out-of-bounds', { ...command, section: 0xffffffff }],
          ['wrong-table', { ...command, tableNode: 0xffffffff }],
          ['wrong-table-existing-list-node', { ...command, tableNode: c.target.listNode }],
          ['list-out-of-bounds', { ...command, listNode: 0xffffffff }],
          ['invalid-color', { ...command, color: 0x1000000 }],
          ['alias-rejected', { ...command, colorRGB24: COLOR }],
        ]) {
          assert.throws(() => editor.setCellBackground(invalid), name);
          assert.equal(editor.historyRevision(), editRevision, `${name}: revision unchanged`);
          assert.deepEqual(editor.historyRevisions(), editRevisions, `${name}: history unchanged`);
          assert.deepEqual(
            observation(c.format, editor, c.target),
            current,
            `${name}: live state unchanged`,
          );
          assert.deepEqual(save(c.format, editor), edited, `${name}: saved bytes unchanged`);
          mark(`${name}-unapplied`);
        }
        reopened = await open(c.format, edited);
        const reopenedView = observation(c.format, reopened, c.target);
        assert.equal(reopenedView.ref, original.nextRef);
        assert.equal(reopenedView.color, COLOR);
        assert.deepEqual(save(c.format, reopened), edited, 'reopen exact edited bytes');
        mark('save-reopen');
        assert.equal(editor.undo(), true);
        assert.equal(editor.historyRevision(), baseRevision);
        assert.deepEqual(
          observation(c.format, editor, c.target),
          initial,
          'undo current-query original',
        );
        if (c.format === 'hwpx') {
          assertHxBatchCurrent(editor, c.target, initial, dir, 'undo');
          mark('batch-undo-current-duplicate-deep-isolation');
        }
        const undone = save(c.format, editor);
        assert.deepEqual(undone, input, 'one undo restores exact original bytes');
        receipt.undoSha256 = sha(undone);
        mark('undo-one-exact-original');
        assert.equal(editor.redo(), true);
        assert.equal(editor.historyRevision(), editRevision);
        assert.deepEqual(
          observation(c.format, editor, c.target),
          current,
          'redo current-query edited',
        );
        if (c.format === 'hwpx') {
          assertHxBatchCurrent(editor, c.target, current, dir, 'redo');
          mark('batch-redo-current-duplicate-deep-isolation');
        }
        const redone = save(c.format, editor);
        assert.deepEqual(redone, edited, 'one redo restores exact edited bytes');
        receipt.redoSha256 = sha(redone);
        mark('redo-one-exact-edited');
        receipt.status = 'pass';
      } catch (error) {
        receipt.status = 'fail';
        receipt.error = { name: error.name, message: error.message, stack: error.stack };
        throw error;
      } finally {
        try {
          reopened?.close();
        } finally {
          try {
            editor?.close();
          } finally {
            writeFileSync(join(dir, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
          }
        }
      }
    },
  );
}
