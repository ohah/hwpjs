import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND,
} from '../packages/core/src/index.ts';
import { originalCellVerticalAlignmentSelector } from '../packages/core/src/commands/original-cell-vertical-alignment.ts';
import { bindRuntimeAdmission } from '../packages/core/src/internal/runtime-admission.ts';
const selector = { section: 0, paragraph: 0, tableNode: 2, listNode: 3 };
const scope = '12345678-1234-4123-8123-123456789abc';
function content(format = 'hwp5') {
  return {
    format,
    readOnly: false,
    limited: false,
    totalParagraphs: 1,
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'A',
        editable: true,
        tableCell: { tableNode: 2, listNode: 3 },
        sourceOffsets: [0, 1],
      },
    ],
    tables: [
      {
        section: 0,
        tableNode: 2,
        rows: 1,
        columns: 1,
        cells: [
          {
            listNode: 3,
            row: 0,
            column: 0,
            rowSpan: 1,
            columnSpan: 1,
            width: 100,
            height: 100,
            paragraphs: [0],
          },
        ],
      },
    ],
  };
}
function state(format = 'hwp5'): any {
  return {
    status: 'ready',
    historyRecoveryRequired: false,
    nativeHistoryStats: { protocolVersion: 2 },
    capabilities: { originalCellVerticalAlignmentAvailable: true },
    content: content(format),
    selection: {
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 0,
      owner: 'section:0:table:2:list:3',
    },
  };
}
for (const format of ['hwp5', 'hwpx'] as const) {
  test(`${format} canonical single original cell selected owner source admission`, () => {
    assert.deepEqual(originalCellVerticalAlignmentSelector(state(format), selector), selector);
  });
  test(`${format} partial created nested protected foreign and noncollapsed owners refuse`, () => {
    const mutations = [
      (s: any) => s.content.tables.push(s.content.tables[0]),
      (s: any) => (s.content.tables[0].partial = true),
      (s: any) => (s.content.tables[0].createdTable = true),
      (s: any) => (s.content.tables[0].parentListNode = 9),
      (s: any) => (s.content.tables[0].cells[0].protected = true),
      (s: any) => (s.content.paragraphs[0].tableCell.listNode = 4),
      (s: any) => (s.selection.endUnit = 1),
      (s: any) => (s.content.paragraphs[0].createdCell = {}),
      (s: any) => (s.content.paragraphs[0].clipped = true),
    ];
    for (const change of mutations) {
      const s = state(format);
      change(s);
      assert.throws(() => originalCellVerticalAlignmentSelector(s, selector));
    }
  });
}
test('capability history readonly window and unknown selector fields fail closed', () => {
  for (const change of [
    (s: any) => (s.capabilities.originalCellVerticalAlignmentAvailable = false),
    (s: any) => (s.nativeHistoryStats.protocolVersion = 1),
    (s: any) => (s.content.readOnly = true),
    (s: any) => (s.capabilities.readOnly = true),
    (s: any) => (s.content.limited = true),
    (s: any) => (s.content.window = {}),
    (s: any) => (s.content.viewKind = 'slice'),
    (s: any) => (s.content.createdTableHostPending = true),
    (s: any) => (s.historyRecoveryRequired = true),
  ]) {
    const s = state();
    change(s);
    assert.throws(() => originalCellVerticalAlignmentSelector(s, selector));
  }
  assert.throws(() => originalCellVerticalAlignmentSelector(state(), { ...selector, row: 0 }));
});
async function setup(format: 'hwp5' | 'hwpx' = 'hwp5', options: any = {}) {
  let revision = 0,
    closed = false,
    live = true;
  const calls: any[] = [];
  const runtime = {
    async request(message: any, context: any) {
      calls.push(message);
      const base: any = {
        kind: message.kind,
        historyRevision: revision,
        originalCellVerticalAlignmentAvailable: true,
        historyStats: {
          protocolVersion: 2,
          requested: {},
          resolved: {},
          retainedBytes: null,
          metadataOwnedBytes: null,
          currentOwnedBytes: null,
          undoOwnedBytes: null,
          redoOwnedBytes: null,
          evictedCount: null,
        },
        meta: { context, application: 'unapplied', changed: false },
      };
      if (message.kind === 'original-cell-vertical-alignment-query')
        return {
          ...base,
          originalCell: {
            schemaVersion: 1,
            format,
            ...selector,
            lease: '7',
            historyRevision: revision,
            value: 'TOP',
            editable: true,
            scope,
            ...options.observation,
          },
        };
      if (message.kind === 'original-cell-vertical-alignment-set') {
        revision++;
        return {
          ...base,
          historyRevision: revision,
          content: content(format),
          applied: true,
          meta: { context, application: 'applied', changed: true },
        };
      }
      return { ...base, content: content(format) };
    },
    dispose() {
      closed = true;
    },
  };
  bindRuntimeAdmission(
    runtime,
    async (m, c, admit) => {
      admit();
      return runtime.request(m, c);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format, editable: true });
  await editor.setSelection(
    createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 0,
    }),
  );
  const surface = editor.acquireInputSurface({
    commitComposition: () => 'unchanged' as const,
    cancelComposition() {},
  });
  return {
    editor,
    surface,
    calls,
    invalidate() {
      live = false;
    },
    capture() {
      return surface.captureOriginalCellVerticalAlignment!(selector, () => live);
    },
    writes() {
      return calls.filter((c) => c.kind === 'original-cell-vertical-alignment-set');
    },
  };
}
for (const format of ['hwp5', 'hwpx'] as const) {
  test(`${format} actual Core queue retains selected lease and dispatches whole observation once`, async () => {
    const h = await setup(format);
    try {
      const selected = h.capture();
      assert.ok(selected);
      const result = await h.editor.getOriginalCellVerticalAlignment(selected!);
      assert.equal(result.state, 'available');
      if (result.state !== 'available') throw Error('unavailable');
      const done = await h.editor.dispatchCommand(SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND, {
        target: result.target,
        value: 'BOTTOM',
      });
      assert.equal(done.status, 'committed-with-snapshot');
      assert.equal(h.writes().length, 1);
      assert.equal(h.writes()[0].request.before.scope, scope);
      assert.equal(h.writes()[0].request.before.listNode, 3);
      const again = await h.editor.dispatchCommand(SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND, {
        target: result.target,
        value: 'TOP',
      });
      assert.equal(again.status, 'rejected-unapplied');
      assert.equal(h.writes().length, 1);
    } finally {
      h.surface.release();
      await h.editor.dispose();
    }
  });
  test(`${format} released surface and changed selection refuse without commit`, async () => {
    const h = await setup(format);
    try {
      const selected = h.capture();
      assert.ok(selected);
      const result = await h.editor.getOriginalCellVerticalAlignment(selected!);
      assert.equal(result.state, 'available');
      if (result.state !== 'available') throw Error('unavailable');
      h.invalidate();
      const done = await h.editor.dispatchCommand(SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND, {
        target: result.target,
        value: 'BOTTOM',
      });
      assert.equal(done.status, 'rejected-unapplied');
      assert.equal(h.writes().length, 0);
      h.surface.release();
      assert.equal(h.capture(), null);
    } finally {
      h.surface.release();
      await h.editor.dispose();
    }
  });
  test(`${format} wrong Native owner and foreign capture cannot mint edit target`, async () => {
    const h = await setup(format, { observation: { listNode: 4 } });
    try {
      assert.throws(() => h.editor.getOriginalCellVerticalAlignment({} as any), /ForeignOrStale/);
      const selected = h.capture();
      assert.ok(selected);
      await assert.rejects(h.editor.getOriginalCellVerticalAlignment(selected!), /OwnerMismatch/);
      assert.equal(h.writes().length, 0);
    } finally {
      h.surface.release();
      await h.editor.dispose();
    }
  });
}
