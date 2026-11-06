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
import { createTableCellBackgroundPort } from '../apps/demo/src/table-cell-background-port.ts';

const FRESH_SHA = '25998a7513b73938abe5e9e614a18733059b42f71f00b13cf663f073c26396b3';
const COLOR = 0x123456;
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
const targetPath = requiredPath('HWPJS_TEST_CELL_BACKGROUND_TARGETS', '.json');
const targetBytes = readFileSync(targetPath),
  roster = JSON.parse(targetBytes);
assert.equal(roster.schemaVersion, 1);
assert.equal(roster.wasmSha256, FRESH_SHA);
assert.ok(Array.isArray(roster.cases) && roster.cases.length >= 2 && roster.cases.length <= 12);
const cases = roster.cases.filter((c) => c.provenance === 'original-noori');
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

const root = resolve('zig-out/verification/cell-border-background-r1/independent');
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
  url: 'https://cell-background-source.invalid/granted-runtime.wasm',
  fetch: async (url, options) => {
    fetchCount++;
    assert.equal(String(url), 'https://cell-background-source.invalid/granted-runtime.wasm');
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
for (const name of ['hwp5_edit_set_cell_background', 'hwpx_edit_set_cell_background'])
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
  let ref, color, rawPattern, rawFillReport;
  if (c.format === 'hwp5') {
    assert.deepEqual(content.cellLayoutSourceErrors, []);
    assert.equal(content.hwp5BorderFillSourceError, null);
    ref = cells[0].layoutSource.border_fill_id;
    const style = content.hwp5BorderFillSources.find((s) => s.id === ref);
    assert.ok(style);
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
    assert.ok(Array.isArray(faces) && faces.length === 1, 'solid cohort semantic face color');
    color = faces[0].rgb;
    rawFillReport = style.fill_report;
  }
  return {
    ref,
    color,
    rawPattern,
    rawFillReport,
    paragraph: row.paragraph,
    text: row.text,
    currentReference: row.currentReference,
    historyRevision: state.nativeHistoryRevision,
    historyRevisions: state.nativeHistoryRevisions,
    historyAvailability: getHistoryAvailability(state),
  };
}
const message = (c, color = COLOR) => ({
  kind: 'cell-background',
  section: c.target.section,
  tableNode: c.target.tableNode,
  listNode: c.target.listNode,
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

test('cell background uses the actual cryptographically registered fresh module', () => {
  assert.equal(fetchCount, 1);
  assert.equal(module instanceof WebAssembly.Module, true);
  assert.equal(readKnownNativeModule(module).sha256, FRESH_SHA);
});

for (const c of cases) {
  test(
    `${c.id}: Core mutation/queue/no-op/rejection/typed history`,
    { concurrency: false, timeout: 30_000 },
    record(`${c.id}-core`, async (receipt) => {
      const { editor } = await setup(c);
      try {
        const beforeState = editor.getEditorState(),
          before = cellView(beforeState, c);
        receipt.before = before;
        assert.equal(beforeState.capabilities.cellBackgroundAvailable, true);
        assert.equal(before.ref, c.sourceRef);
        assert.notEqual(before.color, COLOR);
        assert.equal(before.historyAvailability.available, true);
        // Two real admissions use the same pre-token; FIFO must reject the second after the first commits.
        const token = beforeState.token;
        const first = editor.requestExperimental(message(c), { mutation: true, token });
        const queuedOldToken = editor.requestExperimental(message(c, 0x234567), {
          mutation: true,
          token,
        });
        const applied = await first,
          stale = await queuedOldToken;
        receipt.applied = {
          status: applied.status,
          changed: applied.changed,
          error: applied.error,
        };
        receipt.stale = { status: stale.status, error: stale.error };
        assert.equal(applied.status, 'committed-with-snapshot', applied.error);
        assert.equal(applied.changed, true);
        assert.equal(applied.state, editor.getEditorState());
        assert.equal(stale.status, 'rejected-unapplied');
        assert.equal(stale.error, 'StaleTarget');
        assert.equal(stale.changed, null);
        const afterState = editor.getEditorState(),
          after = cellView(afterState, c);
        receipt.after = after;
        assert.notEqual(afterState, beforeState);
        assert.ok(afterState.operationRevision > beforeState.operationRevision);
        assert.notEqual(after.historyRevision, before.historyRevision);
        assert.equal(after.historyRevisions.length, before.historyRevisions.length + 1);
        assert.equal(after.color, COLOR);
        // Expected refs come from pinned Noori SDK byte-oracle evidence, not a Core generator.
        assert.equal(after.ref, c.format === 'hwp5' ? 19 : 0);
        assert.equal(after.text, before.text);
        if (c.format === 'hwp5')
          assert.equal(after.currentReference.id, before.currentReference.id);
        assert.equal(after.historyAvailability.canUndo, true);
        receipt.checks.push(
          'actual-capability-and-committed-source-snapshot',
          'queued-pretoken-rejected-after-commit',
        );
        const noop = await editor.requestExperimental(message(c), {
          mutation: true,
          token: afterState.token,
        });
        assert.equal(noop.status, 'known-no-op');
        assert.equal(noop.changed, false);
        assert.equal(noop.state, afterState);
        unchanged(editor, afterState, c, after);
        receipt.checks.push('same-color-known-no-op-state-identity');
        receipt.wrongTable = await rejected(
          editor,
          c,
          { ...message(c), tableNode: c.target.listNode },
          c.format === 'hwp5' ? 'InvalidCellDisplayOwner' : 'InvalidCellBackgroundOwner',
        );
        receipt.extraField = await rejected(
          editor,
          c,
          { ...message(c), colorRGB24: COLOR },
          'InvalidCellBackground',
        );
        const beforeClassification = editor.getEditorState(),
          view = cellView(beforeClassification, c);
        assert.throws(
          () =>
            editor.requestExperimental(message(c), {
              mutation: false,
              token: beforeClassification.token,
            }),
          /OperationClassificationMismatch/,
        );
        unchanged(editor, beforeClassification, c, view);
        receipt.checks.push(
          'wrong-owner-unapplied',
          'strict-envelope-unapplied',
          'mutation-false-classification-rejected',
        );
        const undo = await editor.dispatchCommand(UNDO_COMMAND, {
          token: editor.getEditorState().token,
        });
        assert.equal(undo.status, 'committed-with-snapshot', undo.error);
        const undone = cellView(editor.getEditorState(), c);
        receipt.undo = undone;
        assert.equal(undone.ref, before.ref);
        assert.equal(undone.color, before.color);
        assert.equal(undone.historyRevision, before.historyRevision);
        assert.equal(undone.historyAvailability.canRedo, true);
        const redo = await editor.dispatchCommand(REDO_COMMAND, {
          token: editor.getEditorState().token,
        });
        assert.equal(redo.status, 'committed-with-snapshot', redo.error);
        const redone = cellView(editor.getEditorState(), c);
        receipt.redo = redone;
        assert.equal(redone.ref, after.ref);
        assert.equal(redone.color, after.color);
        assert.equal(redone.historyRevision, after.historyRevision);
        receipt.checks.push('typed-undo-redo-current-source-and-history');
      } finally {
        await editor.dispose();
      }
    }),
  );

  test(
    `${c.id}: host read-only admission rejects without changing history`,
    { concurrency: false, timeout: 30_000 },
    record(`${c.id}-readonly`, async (receipt) => {
      const { editor } = await setup(c, false);
      try {
        const state = editor.getEditorState();
        assert.equal(state.content.readOnly, true);
        assert.equal(state.capabilities.readOnly, true);
        const view = cellView(state, c);
        receipt.before = view;
        receipt.historyObservation =
          state.nativeHistoryRevision === undefined
            ? 'Read-only load does not enable history; absent Core history metadata must remain absent.'
            : 'Actual published Native history revision must remain unchanged.';
        receipt.rejection = await rejected(editor, c, message(c), 'ReadOnlyDocument');
        receipt.after = cellView(editor.getEditorState(), c);
        receipt.checks.push('actual-readonly-current-observation-and-write-rejection');
      } finally {
        await editor.dispose();
      }
    }),
  );
}

for (const format of ['hwp5', 'hwpx']) {
  const c = cases.find((item) => item.format === format && item.sourceKind === 'solid');
  assert.ok(c, 'pinned original solid case for each app port');
  test(
    `${format}: actual app background port apply and restoreSelection`,
    { concurrency: false, timeout: 30_000 },
    record(`${format}-app-port`, async (receipt) => {
      const { editor, selected } = await setup(c);
      const port = createTableCellBackgroundPort(editor, {
        createParagraphSelection,
        getSelectionFormatting,
      });
      try {
        const captured = port.capture();
        assert.equal(captured.reason, null);
        assert.equal(captured.writeReason, null);
        assert.equal(captured.currentColor, null, 'app does not infer an observed fill');
        assert.equal(captured.cell.tableNode, c.target.tableNode);
        assert.equal(captured.cell.listNode, c.target.listNode);
        const before = cellView(editor.getEditorState(), c);
        const applied = await port.apply(captured, { color: '#123456', dirty: true });
        receipt.applied = { status: applied.status, error: applied.error };
        assert.equal(applied.status, 'committed-with-snapshot', applied.error);
        assert.equal(cellView(editor.getEditorState(), c).color, COLOR);
        assert.equal(await port.restoreSelection(captured, applied), true);
        const restored = editor.getEditorState().selection;
        assert.equal(restored.owner, selected.owner);
        assert.equal(restored.section, selected.section);
        assert.equal(restored.paragraph, selected.paragraph);
        assert.equal(restored.startUnit, 0);
        assert.equal(restored.endUnit, 0);
        const current = editor.getEditorState(),
          currentView = cellView(current, c);
        const reused = await port.apply(captured, { color: '#234567', dirty: true });
        assert.equal(reused.status, 'rejected-unapplied', 'old app capture cannot reapply');
        unchanged(editor, current, c, currentView);
        const undo = await editor.dispatchCommand(UNDO_COMMAND, { token: current.token });
        assert.equal(undo.status, 'committed-with-snapshot', undo.error);
        assert.equal(cellView(editor.getEditorState(), c).color, before.color);
        assert.equal(editor.getEditorState().nativeHistoryRevision, before.historyRevision);
        receipt.checks.push(
          'actual-app-owned-port-apply',
          'restore-current-public-selection',
          'old-capture-rejected',
          'typed-undo-original',
        );
      } finally {
        port.dispose();
        await editor.dispose();
      }
    }),
  );
}
