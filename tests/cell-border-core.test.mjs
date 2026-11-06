// Source-side Core integration. Run only after main grants the shared heavy slot.
// Actual registered WASM + actual reader runtime; no runtime/context/ref substitution.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
// Same definitions re-exported by public index; avoid its unrelated JSON keymap import in Node.
import { createEditor } from '../packages/core/src/editor/create-editor.ts';
import { createParagraphSelection } from '../packages/core/src/state/paragraph-selection.ts';
import { getSelectionFormatting } from '../packages/core/src/state/formatting-state.ts';
import { getHistoryAvailability } from '../packages/core/src/state/history-state.ts';
import { UNDO_COMMAND, REDO_COMMAND } from '../packages/core/src/commands/commands.ts';
import { createReaderRuntimeFactory } from '../packages/core/src/runtime/reader-runtime.ts';
import {
  createWasmModuleLoader,
  readKnownNativeModule,
} from '../packages/core/src/wasm-module-loader.ts';
import {
  assertCellBorderManifest,
  inspectCellBorderOriginal,
  verifyCellBorderSaved,
} from '../tools/tests/cell-border-save-oracle.mjs';

const FRESH_SHA = process.env.HWPJS_TEST_WASM_SHA256;
assert.match(FRESH_SHA ?? '', /^[0-9a-f]{64}$/, 'explicit fresh SHA mandatory');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function requiredPath(name, extension) {
  const value = process.env[name];
  assert.ok(
    value && isAbsolute(value) && value.endsWith(extension),
    `${name}: explicit absolute ${extension} required`,
  );
  assert.ok(!value.includes('/hwpers/') && !value.includes('hwpers_test4'), 'excluded input');
  return value;
}
const wasmPath = requiredPath('HWPJS_TEST_WASM', '.wasm');
assert.equal(process.env.HWPJS_TEST_WASM_SHA256, FRESH_SHA, 'explicit granted fresh artifact SHA');
const wasmBytes = readFileSync(wasmPath);
assert.equal(hash(wasmBytes), FRESH_SHA);
const targetPath = requiredPath('HWPJS_TEST_CELL_BORDER_TARGETS', '.json');
const targetBytes = readFileSync(targetPath),
  roster = JSON.parse(targetBytes);
assert.equal(roster.schemaVersion, 1);
assert.equal(roster.wasmSha256, FRESH_SHA);
assert.ok(Array.isArray(roster.cases) && roster.cases.length >= 2 && roster.cases.length <= 12);
assertCellBorderManifest(roster, FRESH_SHA);
const cases = roster.cases;
for (const format of ['hwp5', 'hwpx'])
  assert.ok(
    cases.some((c) => c.format === format),
    'both original formats mandatory',
  );
const ids = new Set();
for (const c of cases) {
  assert.match(c.id, /^[a-z0-9-]{1,64}$/);
  assert.ok(!ids.has(c.id));
  ids.add(c.id);
  assert.ok(['hwp5', 'hwpx'].includes(c.format));
  assert.ok(
    isAbsolute(c.fixturePath) && c.fixturePath.endsWith(c.format === 'hwp5' ? '.hwp' : '.hwpx'),
  );
  assert.ok(!c.fixturePath.includes('/hwpers/') && !c.fixturePath.includes('hwpers_test4'));
  assert.match(c.fixtureSha256, /^[0-9a-f]{64}$/);
  assert.ok(
    ['section', 'tableNode', 'listNode'].every(
      (k) => Number.isInteger(c.target[k]) && c.target[k] >= 0 && c.target[k] < 0xffffffff,
    ),
  );
  assert.ok(Number.isInteger(c.sourceRef) && c.sourceRef >= 0);
}

const root = resolve('zig-out/verification/cell-border-edit-r1/independent');
const evidence = join(
  root,
  `core-run-${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`,
);
mkdirSync(evidence, { recursive: true });
let fetchCount = 0;
const mockResponse = () =>
  new Response(Uint8Array.from(wasmBytes), {
    status: 200,
    headers: { 'Content-Type': 'application/wasm' },
  });
const module = await createWasmModuleLoader({
  url: 'https://cell-border-source.invalid/granted-runtime.wasm',
  fetch: async (url, options) => {
    fetchCount++;
    assert.equal(String(url), 'https://cell-border-source.invalid/granted-runtime.wasm');
    assert.equal(options.cache, 'no-cache');
    return mockResponse();
  },
})();
const known = readKnownNativeModule(module);
assert.deepEqual(known, { contract: 'hwp5-exclusive-text-delta-v1', sha256: FRESH_SHA });
const exported = new Set(
  WebAssembly.Module.exports(module)
    .filter((e) => e.kind === 'function')
    .map((e) => e.name),
);
for (const name of ['hwp5_edit_set_cell_border', 'hwpx_edit_set_cell_border'])
  assert.ok(exported.has(name));
writeFileSync(
  join(evidence, 'input-identity.json'),
  JSON.stringify(
    {
      wasmPath,
      wasmSha256: FRESH_SHA,
      targets: targetPath,
      targetSha256: hash(targetBytes),
      knownNativeModule: known,
      fetchCount,
      runtime: 'unwrapped createReaderRuntimeFactory',
    },
    null,
    2,
  ) + '\n',
);

const history = { mode: 'legacy-v1', maxEntries: 8, maxCheckpointBytes: 8 * 1024 * 1024 };
const factory = createReaderRuntimeFactory({ wasmModule: module });
async function setup(c, editable = true) {
  const bytes = readFileSync(c.fixturePath);
  assert.equal(hash(bytes), c.fixtureSha256);
  const editor = createEditor({ runtimeFactory: factory });
  try {
    await editor.load(bytes, { format: c.format, editable, ...(editable ? { history } : {}) });
    assert.equal(editor.getEditorState().status, 'ready');
    const selected = await selectCell(editor, c);
    return { editor, selected };
  } catch (error) {
    await editor.dispose();
    throw error;
  }
}
function selectedRow(state, c) {
  const content = state.content;
  assert.equal(content.format, c.format);
  assert.equal(content.limited, false, 'full original document view');
  assert.ok(!content.window && !content.viewKind);
  const rows = content.paragraphs.filter(
    (row) =>
      row.section === c.target.section &&
      row.tableCell?.tableNode === c.target.tableNode &&
      row.tableCell?.listNode === c.target.listNode,
  );
  assert.ok(rows.length > 0, 'current Native snapshot contains pinned original cell paragraph');
  const row = rows.find((p) => !p.clipped && !p.createdCell);
  assert.ok(row, 'no clipped/generated selection substitute');
  if (c.format === 'hwp5') {
    assert.equal(row.currentReference?.kind, 'original');
    assert.equal(row.currentReference.section, c.target.section);
    assert.match(row.currentReference.epoch, /^[1-9][0-9]*$/);
  }
  return row;
}
async function selectCell(editor, c) {
  const state = editor.getEditorState(),
    row = selectedRow(state, c);
  const target = createParagraphSelection(state, {
    section: row.section,
    paragraph: row.paragraph,
    startUnit: 0,
    endUnit: 0,
  });
  assert.equal(
    target.owner,
    `section:${c.target.section}:table:${c.target.tableNode}:list:${c.target.listNode}`,
  );
  await editor.setSelection(target, { stateVersion: state.stateVersion });
  assert.deepEqual(getSelectionFormatting(editor.getEditorState()).target, target);
  return target;
}
function cellView(state, c) {
  const content = state.content,
    row = selectedRow(state, c);
  const tables = content.tables.filter(
    (t) => t.section === c.target.section && t.tableNode === c.target.tableNode,
  );
  assert.equal(tables.length, 1);
  assert.equal(tables[0].partial, false);
  const cells = tables[0].cells.filter((v) => v.listNode === c.target.listNode);
  assert.equal(cells.length, 1);
  let ref, color, rawPattern, rawFillReport, edges;
  if (c.format === 'hwp5') {
    assert.deepEqual(content.cellLayoutSourceErrors, []);
    assert.equal(content.hwp5BorderFillSourceError, null);
    ref = cells[0].layoutSource.border_fill_id;
    const style = content.hwp5BorderFillSources.find((s) => s.id === ref);
    assert.ok(style);
    edges = style.borders.slice(0, 4).map((e) => ({
      style: { 0: 'NONE', 1: 'SOLID', 8: 'DOUBLE_SLIM' }[e.kind],
      width: [10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500][e.width],
      color: ((e.color & 255) << 16) | (e.color & 0xff00) | ((e.color >>> 16) & 255),
    }));
    rawPattern = style.pattern;
    const raw = rawPattern?.background;
    color = raw === undefined ? null : ((raw & 255) << 16) | (raw & 0xff00) | ((raw >>> 16) & 255);
  } else {
    assert.deepEqual(content.tableBorderSourceErrors, []);
    const reports = content.tableBorderSources.filter((r) => r.section === c.target.section);
    assert.equal(reports.length, 1);
    const matches = reports[0].cells.filter(
      (v) => v.table_node === c.target.tableNode && v.list_node === c.target.listNode,
    );
    assert.equal(matches.length, 1);
    ref = matches[0].border_fill_id;
    const style = reports[0].styles.find((s) => s.id === ref);
    assert.ok(style, 'zero is a valid cloned ID');
    const faces =
      style.semantic_face_colors ??
      style.semantic_fill_colors?.filter((f) => f.field === 'winBrush.faceColor');
    if (style.fill_node === null) {
      assert.equal(faces?.length ?? 0, 0);
      color = null;
    } else {
      assert.ok(Array.isArray(faces) && faces.length === 1);
      color = faces[0].rgb;
    }
    edges = style.edges.map((e) => {
      const raw = parseInt(e.color.slice(1), 16);
      return {
        style: e.style,
        width: Math.round(parseFloat(e.width) * 100),
        color: raw,
      };
    });
    rawFillReport = style.fill_report;
  }
  return {
    ref,
    color,
    rawPattern,
    rawFillReport,
    edges,
    paragraph: row.paragraph,
    text: row.text,
    currentReference: row.currentReference,
    historyRevision: state.nativeHistoryRevision,
    historyRevisions: state.nativeHistoryRevisions,
    historyAvailability: getHistoryAvailability(state),
  };
}
const message = (c, edges = 5, style = 'DOUBLE_SLIM', width = 70, color = 0x123456) => ({
  kind: 'cell-border',
  section: c.target.section,
  tableNode: c.target.tableNode,
  listNode: c.target.listNode,
  edges,
  style,
  width,
  color,
});
function unchanged(editor, state, c, before) {
  assert.equal(
    editor.getEditorState(),
    state,
    'rejection/no-op preserves exact EditorState identity',
  );
  assert.deepEqual(
    cellView(editor.getEditorState(), c),
    before,
    'current source refs/color/history unchanged',
  );
}
async function rejected(editor, c, bad, expected) {
  const state = editor.getEditorState(),
    view = cellView(state, c);
  const result = await editor.requestExperimental(bad, { mutation: true, token: state.token });
  assert.equal(result.status, 'rejected-unapplied');
  assert.equal(result.error, expected);
  // Core reject() omits runtime reply metadata: null is not an applied-state assertion.
  assert.equal(result.changed, null);
  unchanged(editor, state, c, view);
  return { status: result.status, error: result.error };
}
function record(id, body) {
  return async () => {
    const receipt = {
      id,
      label: 'source-core-integration',
      wasmSha256: FRESH_SHA,
      checks: [],
      status: 'running',
    };
    try {
      await body(receipt);
      receipt.status = 'pass';
    } catch (error) {
      receipt.status = 'fail';
      receipt.error = { name: error.name, message: error.message, stack: error.stack };
      throw error;
    } finally {
      writeFileSync(join(evidence, `${id}.json`), JSON.stringify(receipt, null, 2) + '\n');
    }
  };
}

for (const c of cases) {
  test(
    `${c.id}: actual Core cell-border token/FIFO/history/save`,
    { concurrency: false, timeout: 60000 },
    record(`${c.id}-core`, async (receipt) => {
      const { editor } = await setup(c);
      let reopened;
      try {
        const input = readFileSync(c.fixturePath);
        const original = inspectCellBorderOriginal({
          format: c.format,
          before: input,
          target: c.target,
        });
        const initial = editor.getEditorState(),
          before = cellView(initial, c);
        const token = initial.token;
        const first = editor.requestExperimental(message(c), { mutation: true, token });
        const queued = editor.requestExperimental(message(c, 2), { mutation: true, token });
        const applied = await first,
          stale = await queued;
        assert.equal(applied.status, 'committed-with-snapshot', applied.error);
        assert.equal(applied.changed, true);
        assert.equal(stale.status, 'rejected-unapplied');
        assert.equal(stale.error, 'StaleTarget');
        const current = cellView(editor.getEditorState(), c);
        assert.equal(current.ref, original.nextRef);
        const expectedEdges = original.edges.map((e) => ({
          style:
            c.format === 'hwp5'
              ? { 0: 'NONE', 1: 'SOLID', 8: 'DOUBLE_SLIM' }[e.styleCode]
              : e.style,
          width: e.width,
          color: e.color,
        }));
        for (let i = 0; i < 4; i++)
          if (5 & (1 << i)) expectedEdges[i] = { style: 'DOUBLE_SLIM', width: 70, color: 0x123456 };
        assert.deepEqual(current.edges, expectedEdges, 'actual Core current border before save');
        assert.equal(current.color, original.color, 'border preserves background');
        const saveBytes = async (e) =>
          Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
        const edited = await saveBytes(editor);
        const op = message(c);
        delete op.section;
        delete op.tableNode;
        delete op.listNode;
        receipt.oracle = verifyCellBorderSaved({
          format: c.format,
          before: input,
          after: edited,
          target: c.target,
          operations: [op],
          expectedRef: original.nextRef,
        });
        writeFileSync(
          join(evidence, `${c.id}-edited.${c.format === 'hwp5' ? 'hwp' : 'hwpx'}`),
          edited,
        );
        const state = editor.getEditorState(),
          view = cellView(state, c);
        const noop = await editor.requestExperimental(message(c), {
          mutation: true,
          token: state.token,
        });
        assert.equal(noop.status, 'known-no-op');
        assert.equal(noop.changed, false);
        unchanged(editor, state, c, view);
        // Strict envelope validation and owner failure both leave state and history untouched.
        for (const bad of [
          { ...message(c), extra: 1 },
          { ...message(c), edges: 0 },
          { ...message(c), style: 'DASH' },
          { ...message(c), width: 13 },
          { ...message(c), color: '0' },
          { ...message(c), tableNode: c.target.listNode },
          { ...message(c), section: 0xffffffff },
        ]) {
          const frozen = editor.getEditorState(),
            snapshot = cellView(frozen, c);
          const rejected = await editor.requestExperimental(bad, {
            mutation: true,
            token: frozen.token,
          });
          assert.equal(rejected.status, 'rejected-unapplied');
          unchanged(editor, frozen, c, snapshot);
        }
        assert.deepEqual(await saveBytes(editor), edited);
        const undo = await editor.dispatchCommand(UNDO_COMMAND, {
          token: editor.getEditorState().token,
        });
        assert.equal(undo.status, 'committed-with-snapshot', undo.error);
        assert.equal(cellView(editor.getEditorState(), c).ref, before.ref);
        assert.equal(cellView(editor.getEditorState(), c).historyRevision, before.historyRevision);
        assert.deepEqual(await saveBytes(editor), input);
        const redo = await editor.dispatchCommand(REDO_COMMAND, {
          token: editor.getEditorState().token,
        });
        assert.equal(redo.status, 'committed-with-snapshot', redo.error);
        assert.deepEqual(await saveBytes(editor), edited);
        reopened = createEditor({ runtimeFactory: factory });
        await reopened.load(edited, { format: c.format, editable: true, history });
        assert.deepEqual(await saveBytes(reopened), edited);
        assert.equal(cellView(reopened.getEditorState(), c).ref, original.nextRef);
        receipt.checks.push(
          'real-reader-runtime',
          'exact-seven-scalars-plus-kind-and-token',
          'FIFO-stale-token',
          'no-op-state-identity',
          'independent-save',
          'typed-undo-redo',
          'reopen',
        );
      } finally {
        await reopened?.dispose();
        await editor.dispose();
      }
    }),
  );
  test(
    `${c.id}: Core read-only admission`,
    { concurrency: false, timeout: 60000 },
    record(`${c.id}-readonly`, async (receipt) => {
      const { editor } = await setup(c, false);
      try {
        receipt.rejection = await rejected(editor, c, message(c), 'ReadOnlyDocument');
      } finally {
        await editor.dispose();
      }
    }),
  );
}
