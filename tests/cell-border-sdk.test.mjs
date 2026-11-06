// Mandatory fresh-WASM integration sidecar. No stale fallback and no skip path.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createExperimentalHwp5Editor } from '../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../js/hwpx-editor.mjs';
import {
  assertCellBorderManifest,
  inspectCellBorderOriginal,
  verifyCellBorderSaved,
} from '../tools/tests/cell-border-save-oracle.mjs';

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
for (const name of ['hwpx_edit_set_cell_border', 'hwp5_edit_set_cell_border']) {
  assert.ok(exportNames.has(name), `fresh cell border export required: ${name}`);
}

const manifestPath = pinnedPath('HWPJS_TEST_CELL_BORDER_TARGETS');
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
assertCellBorderManifest(manifest, expectedWasmSha);
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
const evidenceParent = resolve('zig-out/verification/cell-border-edit-r1/independent');
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
      exports: ['hwpx_edit_set_cell_border', 'hwp5_edit_set_cell_border'],
    },
    null,
    2,
  ) + '\n',
);

const selector = (c) => ({
  section: c.target.section,
  tableNode: c.target.tableNode,
  listNode: c.target.listNode,
});
const border = (edges, style = 'SOLID', width = 50, color = 0x123456) => ({
  kind: 'cell-border',
  edges,
  style,
  width,
  color,
});
const background = { kind: 'cell-background', color: 0x345678 };
export const scenarios = [
  { id: 'border-only', ops: [border(15, 'DOUBLE_SLIM')] },
  { id: 'background-then-border', ops: [background, border(5)] },
  { id: 'border-then-background', ops: [border(5), background] },
  {
    id: 'repeated-edges-none-black',
    ops: [
      border(1),
      border(2, 'DOUBLE_SLIM', 70),
      border(1, 'NONE', 10, 0),
      border(12, 'SOLID', 20, 0),
    ],
  },
];
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
  return Buffer.from(
    format === 'hwp5' ? editor.save({ allowStaleLayout: true }).bytes : editor.save(),
  );
}
function apply(editor, c, op) {
  const { kind, ...payload } = op;
  return editor[kind === 'cell-border' ? 'setCellBorder' : 'setCellBackground']({
    ...selector(c),
    ...payload,
  });
}
function current(editor, c) {
  if (c.format === 'hwpx') {
    const single = editor.tableBorderSources(c.target.section);
    const batch = editor.tableBorderSourcesBatch([c.target.section, c.target.section]);
    assert.deepEqual(
      batch.map((x) => x.value),
      [single, single],
      'batch reports current sparse merged intent before save',
    );
    return single;
  }
  return { cells: editor.cellLayoutSources(c.target.section), styles: editor.borderFillSources() };
}
const WIDTHS = [10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500];
const swap = (n) => ((n & 255) << 16) | (n & 0xff00) | ((n >>> 16) & 255);
function assertCurrent(view, c, original, ops) {
  const cells = view.cells;
  const cell = cells.find(
    (x) =>
      (c.format === 'hwp5' ? x.table_record_node : x.table_node) === c.target.tableNode &&
      x.list_node === c.target.listNode,
  );
  assert.ok(cell, 'current selected owner');
  assert.equal(cell.border_fill_id, original.nextRef);
  const style = view.styles.find((x) => x.id === cell.border_fill_id);
  assert.ok(style);
  const expected = original.edges.map((e) => ({
    ...e,
    ...(c.format === 'hwp5'
      ? { style: { 0: 'NONE', 1: 'SOLID', 8: 'DOUBLE_SLIM' }[e.styleCode] }
      : {}),
  }));
  let color = original.color;
  for (const op of ops) {
    if (op.kind === 'cell-background') color = op.color;
    else
      for (let i = 0; i < 4; i++)
        if (op.edges & (1 << i))
          expected[i] = { style: op.style, width: op.width, color: op.color };
  }
  for (let i = 0; i < 4; i++) {
    const raw = c.format === 'hwp5' ? style.borders[i] : style.edges[i];
    const actual =
      c.format === 'hwp5'
        ? {
            style: { 0: 'NONE', 1: 'SOLID', 8: 'DOUBLE_SLIM' }[raw.kind],
            width: WIDTHS[raw.width],
            color: swap(raw.color),
          }
        : {
            style: raw.style,
            width: Math.round(parseFloat(raw.width) * 100),
            color: parseInt(raw.color.slice(1), 16),
          };
    assert.deepEqual(
      actual,
      { style: expected[i].style, width: expected[i].width, color: expected[i].color },
      `current edge ${i} decoded independently`,
    );
  }
  const actualColor =
    c.format === 'hwp5'
      ? style.pattern
        ? swap(style.pattern.background)
        : null
      : ((style.semantic_face_colors ??
          style.semantic_fill_colors?.filter((x) => x.field === 'winBrush.faceColor'))?.[0]?.rgb ??
        null);
  assert.equal(actualColor, color, 'current merged background preserved');
}
for (const c of manifest.cases)
  for (const scenario of scenarios) {
    test(
      `${c.id}: ${scenario.id} independent save/history/reopen`,
      { concurrency: false, timeout: 75000 },
      async () => {
        const dir = join(evidence, `${c.id}-${scenario.id}`);
        mkdirSync(dir);
        const receipt = { id: c.id, scenario: scenario.id, status: 'running', checks: [] };
        let editor, reopened;
        try {
          const input = readFileSync(c.fixturePath);
          assert.equal(sha(input), c.fixtureSha256);
          const original = inspectCellBorderOriginal({
            format: c.format,
            before: input,
            target: c.target,
          });
          assert.equal(original.sourceRef, c.sourceRef);
          assert.equal(original.sourceKind, c.sourceKind);
          if (c.requireShared) assert.ok(original.sharedCount >= 2);
          receipt.original = original;
          editor = await open(c.format, input);
          assert.deepEqual(save(c.format, editor), input);
          editor.enableHistory({ maxEntries: 12, maxCheckpointBytes: 8 * 1024 * 1024 });
          const snapshots = [input],
            views = [current(editor, c)],
            revisions = [editor.historyRevision()];
          const sourceLeft = original.edges[0];
          const originalLeft = border(
            1,
            c.format === 'hwp5'
              ? { 0: 'NONE', 1: 'SOLID', 8: 'DOUBLE_SLIM' }[sourceLeft.styleCode]
              : sourceLeft.style,
            sourceLeft.width,
            sourceLeft.color,
          );
          apply(editor, c, originalLeft);
          assert.equal(editor.historyRevision(), revisions[0], 'original field request is no-op');
          assert.deepEqual(save(c.format, editor), input);

          for (const [i, op] of scenario.ops.entries()) {
            const oldRevision = editor.historyRevision();
            apply(editor, c, op);
            assert.notEqual(
              editor.historyRevision(),
              oldRevision,
              'explicit changed request appends history',
            );
            const view = current(editor, c); // Query BEFORE save, no repair by save.
            assertCurrent(view, c, original, scenario.ops.slice(0, i + 1));
            writeFileSync(join(dir, `current-${i}.json`), JSON.stringify(view, null, 2) + '\n');
            const bytes = save(c.format, editor);
            writeFileSync(join(dir, `saved-${i}.${c.format === 'hwp5' ? 'hwp' : 'hwpx'}`), bytes);
            const request = {
              format: c.format,
              before: input,
              after: bytes,
              target: c.target,
              operations: scenario.ops.slice(0, i + 1),
              expectedRef: original.nextRef,
            };
            const verified = verifyCellBorderSaved(request);
            receipt.checks.push({ stage: i, sha256: sha(bytes), oracle: verified });
            const wrong = structuredClone(request);
            wrong.operations.at(-1).color ^= 0x010101;
            assert.throws(() => verifyCellBorderSaved(wrong), 'oracle rejects wrong decoded RGB');
            assert.throws(
              () => verifyCellBorderSaved({ ...request, expectedRef: original.nextRef + 1 }),
              'oracle rejects wrong reference',
            );
            const revision = editor.historyRevision(),
              history = editor.historyRevisions();
            apply(editor, c, op);
            assert.equal(editor.historyRevision(), revision, 'repeat exact request is no-op');
            assert.deepEqual(editor.historyRevisions(), history);
            assert.deepEqual(save(c.format, editor), bytes);
            snapshots.push(bytes);
            views.push(view);
            revisions.push(revision);
          }
          // Strict seven scalar payload: aliases, extras, wrong domains, missing keys rejected unapplied.
          const good = { ...selector(c), ...border(1) };
          delete good.kind;
          const beforeInvalid = save(c.format, editor),
            rev = editor.historyRevision();
          for (const invalid of [
            null,
            [],
            { ...good, extra: 0 },
            { ...good, colorRGB24: 0 },
            { ...good, edges: 0 },
            { ...good, edges: 16 },
            { ...good, style: 'DASH' },
            { ...good, width: 13 },
            { ...good, color: 0x1000000 },
            { ...good, color: '0' },
            { ...good, section: 0xffffffff },
            { ...good, tableNode: c.target.listNode },
            { ...good, listNode: 0xffffffff },
            { ...good, width: NaN },
            { ...good, edges: 1.5 },
            { ...good, color: -1 },
            { ...good, section: 0x100000000 },
            { ...good, [Symbol('extra')]: 0 },
            ...Object.keys(good).map((k) =>
              Object.fromEntries(Object.entries(good).filter(([key]) => key !== k)),
            ),
          ]) {
            assert.throws(() => editor.setCellBorder(invalid));
            assert.equal(editor.historyRevision(), rev);
            assert.deepEqual(save(c.format, editor), beforeInvalid);
          }
          for (let i = scenario.ops.length - 1; i >= 0; i--) {
            assert.equal(editor.undo(), true);
            assert.equal(editor.historyRevision(), revisions[i]);
            assert.deepEqual(current(editor, c), views[i]);
            assert.deepEqual(save(c.format, editor), snapshots[i]);
            if (i === 0) {
              apply(editor, c, originalLeft);
              assert.equal(
                editor.historyRevision(),
                revisions[0],
                'source no-op retains redo at original state',
              );
              assert.deepEqual(save(c.format, editor), input);
            }
            // Undoing the last edit leaves a prior requested value active; repeating it must retain redo.
            if (i > 0) {
              const redo = editor.historyRevisions(),
                revision = editor.historyRevision();
              apply(editor, c, scenario.ops[i - 1]);
              assert.equal(editor.historyRevision(), revision);
              assert.deepEqual(editor.historyRevisions(), redo);
              assert.deepEqual(save(c.format, editor), snapshots[i]);
            }
          }
          for (let i = 1; i < snapshots.length; i++) {
            assert.equal(editor.redo(), true);
            assert.equal(editor.historyRevision(), revisions[i]);
            assert.deepEqual(current(editor, c), views[i]);
            assert.deepEqual(save(c.format, editor), snapshots[i]);
          }
          const edited = snapshots.at(-1);
          reopened = await open(c.format, edited);
          assert.deepEqual(save(c.format, reopened), edited, 'reopened current bytes exact');
          assert.deepEqual(current(reopened, c), views.at(-1), 'reopen queries match edit queries');
          verifyCellBorderSaved({
            format: c.format,
            before: input,
            after: save(c.format, reopened),
            target: c.target,
            operations: scenario.ops,
            expectedRef: original.nextRef,
          });
          receipt.status = 'pass';
        } catch (error) {
          receipt.status = 'fail';
          receipt.error = { name: error.name, message: error.message, stack: error.stack };
          throw error;
        } finally {
          reopened?.close();
          editor?.close();
          writeFileSync(join(dir, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
        }
      },
    );
  }
