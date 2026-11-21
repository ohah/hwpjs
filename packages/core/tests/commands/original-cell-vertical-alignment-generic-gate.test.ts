import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND,
} from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import { surfaceOperation } from '../../src/commands/surface-protocol.ts';
const query = 'original-cell-vertical-alignment-query',
  set = 'original-cell-vertical-alignment-set';
const current = { section: 0, paragraph: 0, tableNode: 2, listNode: 3 };
const foreign = { section: 0, paragraph: 1, tableNode: 2, listNode: 4 };
async function setup(format: 'hwp5' | 'hwpx') {
  let revision = 0,
    closed = false;
  const calls: any[] = [];
  const content = () => ({
    format,
    readOnly: false,
    limited: false,
    totalParagraphs: 2,
    paragraphs: [0, 1].map((paragraph) => ({
      section: 0,
      paragraph,
      text: 'A',
      editable: true,
      tableCell: { tableNode: 2, listNode: 3 + paragraph },
      sourceOffsets: [0, 1],
    })),
    tables: [
      {
        section: 0,
        tableNode: 2,
        rows: 1,
        columns: 2,
        cells: [0, 1].map((column) => ({
          listNode: 3 + column,
          row: 0,
          column,
          rowSpan: 1,
          columnSpan: 1,
          width: 100,
          height: 100,
          paragraphs: [column],
        })),
      },
    ],
  });
  const before = (selector: any) => ({
    schemaVersion: 1,
    format,
    ...selector,
    lease: '8',
    scope: '12345678-1234-4123-8123-123456789abc',
    historyRevision: revision,
    value: 'TOP',
    editable: true,
  });
  const runtime = {
    async request(message: any, context: any) {
      calls.push(message);
      const base: any = {
        kind: message.kind,
        originalCellVerticalAlignmentAvailable: true,
        historyRevision: revision,
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
      if (message.kind === query) return { ...base, originalCell: before(message.selector) };
      if (message.kind === set || message.kind === 'cell-size') {
        revision++;
        return {
          ...base,
          historyRevision: revision,
          content: content(),
          applied: true,
          meta: { context, application: 'applied', changed: true },
        };
      }
      return { ...base, content: content() };
    },
    dispose() {
      closed = true;
    },
  };
  // Private fake Native transport: tests the actual public Core boundaries, not an engine artifact.
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
    before,
    rawCalls: () => calls.filter((c) => c.kind === query || c.kind === set),
    async dispose() {
      surface.release();
      await editor.dispose();
    },
  };
}
for (const format of ['hwp5', 'hwpx'] as const) {
  for (const channel of ['experimental', 'resource', 'surface'] as const)
    for (const kind of [query, set]) {
      test(`${format} ${channel} generic ${kind} cannot read or edit an unselected owner`, async () => {
        const h = await setup(format);
        try {
          const message =
            kind === query
              ? { kind, selector: foreign }
              : { kind, request: { before: h.before(foreign), value: 'BOTTOM' } };
          let blocked = false;
          try {
            const token = h.editor.getEditorState().token;
            if (channel === 'experimental')
              await h.editor.requestExperimental(message, { token, mutation: kind === set });
            else if (channel === 'resource') await h.editor.readResource(message, { token });
            else await h.surface.request(message, { token, coordinates: 'legacy-native' });
          } catch (error) {
            assert.match(String(error), /UseTypedEditorOperation|UnsupportedReadOperation/);
            blocked = true;
          }
          assert.equal(
            h.rawCalls().length,
            0,
            `generic route reached typed Native wire: ${JSON.stringify(h.rawCalls())}`,
          );
          assert.equal(blocked, true);
        } finally {
          await h.dispose();
        }
      });
    }
  test(`${format} typed captured owner query and command remain available`, async () => {
    const h = await setup(format);
    try {
      const selected = h.surface.captureOriginalCellVerticalAlignment!(current, () => true);
      assert.ok(selected);
      const read = await h.editor.getOriginalCellVerticalAlignment(selected!);
      assert.equal(read.state, 'available');
      if (read.state !== 'available') throw Error('unavailable');
      const result = await h.editor.dispatchCommand(SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND, {
        target: read.target,
        value: 'BOTTOM',
      });
      assert.equal(result.status, 'committed-with-snapshot');
      assert.equal(h.rawCalls().length, 2);
    } finally {
      await h.dispose();
    }
  });
  test(`${format} unrelated generic cell-size operation and private classification are preserved`, async () => {
    const h = await setup(format);
    try {
      assert.equal(surfaceOperation(query), 'read');
      assert.equal(surfaceOperation(set), 'mutation');
      const result: any = await h.surface.request(
        { kind: 'cell-size', section: 0, listNode: 3, width: 120, height: 100 },
        { token: h.editor.getEditorState().token, coordinates: 'legacy-native' },
      );
      assert.equal(result.status, 'committed-with-snapshot');
      assert.equal(h.rawCalls().length, 0);
    } finally {
      await h.dispose();
    }
  });
}
