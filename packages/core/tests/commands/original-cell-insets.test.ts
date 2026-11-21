import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  SET_ORIGINAL_CELL_INSETS_COMMAND,
} from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import { surfaceOperation } from '../../src/commands/surface-protocol.ts';
const query = 'original-cell-insets-query',
  set = 'original-cell-insets-set';
const current = { section: 0, paragraph: 0, tableNode: 2, listNode: 3 };
const foreign = { section: 0, paragraph: 1, tableNode: 2, listNode: 4 };
async function setup(
  format: 'hwp5' | 'hwpx',
  options: { readonly?: boolean; absent?: boolean; stale?: boolean } = {},
) {
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
    lease: options.readonly ? null : '8',
    scope: '12345678-1234-4123-8123-123456789abc',
    historyRevision: revision,
    mode: 'inherit',
    effective: [1, 2, 3, 4],
    tableDefaults: [1, 2, 3, 4],
    frame: { width: 100, height: 100 },
    editable: !options.readonly,
  });
  const runtime = {
    async request(message: any, context: any) {
      calls.push(message);
      const base: any = {
        kind: message.kind,
        originalCellVerticalAlignmentAvailable: false,
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
      if (message.kind === query)
        return { ...base, cellInsets: options.absent ? null : before(message.selector) };
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
              : {
                  kind,
                  request: { before: h.before(foreign), patch: { mode: 'custom', left: 0 } },
                };
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
      const selected = h.surface.captureOriginalCellProperties!(current, () => true);
      assert.ok(selected);
      const read = await h.editor.getOriginalCellInsets(selected!);
      assert.equal(read.state, 'available');
      if (read.state !== 'available') throw Error('unavailable');
      const result = await h.editor.dispatchCommand(SET_ORIGINAL_CELL_INSETS_COMMAND, {
        target: read.target,
        patch: { mode: 'custom', left: 0 },
      });
      assert.equal(result.status, 'committed-with-snapshot');
      assert.equal(h.rawCalls().length, 2);
      assert.deepEqual(h.rawCalls()[1].request.patch, { mode: 'custom', left: 0 });
      const replay = await h.editor.dispatchCommand(SET_ORIGINAL_CELL_INSETS_COMMAND, {
        target: read.target,
        patch: { mode: 'custom', left: 0 },
      });
      assert.equal(replay.status, 'rejected-unapplied');
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

for (const format of ['hwp5', 'hwpx'] as const) {
  test(`${format} readonly observation hides authority and absent feature is unavailable`, async () => {
    for (const readonly of [true, false]) {
      const h = await setup(format, { readonly, absent: !readonly });
      try {
        const selected = h.surface.captureOriginalCellProperties!(current, () => true);
        assert.ok(selected);
        const read = await h.editor.getOriginalCellInsets(selected!);
        assert.equal(read.state, readonly ? 'readonly' : 'unavailable');
        assert.equal('target' in read, false);
        if (read.state === 'readonly') {
          assert.equal('lease' in read.observation, false);
          assert.equal('scope' in read.observation, false);
          assert.deepEqual(read.observation.effective, [1, 2, 3, 4]);
        }
      } finally {
        await h.dispose();
      }
    }
  });
  test(`${format} foreign target and changed selection never reach setter`, async () => {
    const h = await setup(format);
    try {
      const selected = h.surface.captureOriginalCellProperties!(current, () => true);
      assert.ok(selected);
      const read = await h.editor.getOriginalCellInsets(selected!);
      assert.equal(read.state, 'available');
      if (read.state !== 'available') throw Error('unavailable');
      const foreignResult = await h.editor.dispatchCommand(SET_ORIGINAL_CELL_INSETS_COMMAND, {
        target: {} as any,
        patch: { mode: 'custom', left: 0 },
      });
      assert.equal(foreignResult.status, 'rejected-unapplied');
      await h.editor.setSelection(
        createParagraphSelection(h.editor.getEditorState(), {
          section: 0,
          paragraph: 1,
          startUnit: 0,
          endUnit: 0,
        }),
      );
      const staleResult = await h.editor.dispatchCommand(SET_ORIGINAL_CELL_INSETS_COMMAND, {
        target: read.target,
        patch: { mode: 'custom', left: 0 },
      });
      assert.equal(staleResult.status, 'rejected-unapplied');
      assert.equal(h.calls.filter((c) => c.kind === set).length, 0);
    } finally {
      await h.dispose();
    }
  });
}

// Unknown modules/custom transports never acquire authority by advertising the optional ABI.
import { createReaderEditorRuntime } from '../../src/runtime/reader-runtime.ts';
import { createWorkerEditorRuntime } from '../../src/worker-runtime.ts';
import {
  requestAtRuntimeAdmission,
  hasRuntimeAdmission,
} from '../../src/internal/runtime-admission.ts';
for (const kind of [query, set])
  test(kind + ' unknown reader and custom Worker remain closed', async () => {
    const wasmModule = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    const reader = createReaderEditorRuntime({ wasmModule });
    let posts = 0;
    const worker = createWorkerEditorRuntime({
      wasmModule,
      workerFactory: () => ({
        addEventListener() {},
        removeEventListener() {},
        terminate() {},
        postMessage() {
          posts++;
          throw Error('UnexpectedUnqualifiedDispatch');
        },
      }),
    });
    try {
      assert.equal(hasRuntimeAdmission(reader, kind), false);
      assert.equal(hasRuntimeAdmission(worker, kind), false);
      assert.throws(
        () => requestAtRuntimeAdmission(worker, { kind }, {} as any, () => {}),
        /UnsupportedAtomicRuntime/,
      );
      assert.equal(posts, 0);
    } finally {
      await reader.dispose();
      await worker.dispose();
    }
  });
