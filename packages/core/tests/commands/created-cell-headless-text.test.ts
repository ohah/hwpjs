// Controlled runtime only. No Native/WASM, SDK dist, DOM or Surface execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, SPLICE_TEXT_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';

const selector = { section: 2, identity: '9007199254740993', row: 0, column: 1 };
const range = { startUnit: 3, endUnit: 3 };
function controlled(format: 'hwp5' | 'hwpx' = 'hwpx', readOnly = false, initialText = '앞😀뒤') {
  const messages: any[] = [];
  let revision = 4,
    text = initialText,
    session = 'logical-session',
    mismatch = false;
  let block: Promise<void> | undefined;
  let application: 'applied' | 'unapplied' | 'unknown' = 'applied';
  const content = () => ({
    format,
    limited: false,
    readOnly,
    createdCellTypingScope: 3,
    paragraphs: [],
    createdTables: [{ ...selector, cells: [{ row: 0, column: 1, text }] }],
  });
  const runtime = {
    async request(message: any, context: any): Promise<any> {
      messages.push(structuredClone(message));
      const base = () => ({
        kind: message.kind,
        historyRevision: revision,
        historyRevisions: [revision],
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
        meta: { context, application: 'applied', changed: true },
      });
      if (message.kind === 'created-cell-text-target') {
        await block;
        return {
          ...base(),
          createdCellText: {
            schemaVersion: 1,
            format,
            scope: 3,
            binding: { session, revision: mismatch ? revision + 1 : revision },
            selector,
            text,
            ...(format === 'hwp5'
              ? {
                  reference: {
                    kind: 'cell',
                    scope: 'actual-scope',
                    epoch: 7,
                    section: 2,
                    id: selector.identity,
                    row: 0,
                    column: 1,
                  },
                }
              : {}),
          },
        };
      }
      if (message.kind === 'created-cell-splice') {
        if (application === 'applied') {
          text = text.slice(0, message.startUnit) + message.text + text.slice(message.endUnit);
          revision++;
        }
        return {
          ...base(),
          content: content(),
          meta: {
            context,
            application,
            changed: application === 'unknown' ? undefined : application === 'applied',
          },
          ...(application === 'unapplied'
            ? { error: 'ControlledRejected' }
            : application === 'unknown'
              ? { error: 'ControlledUncertain', historyPoisoned: true }
              : {}),
        };
      }
      if (message.kind === 'undo' || message.kind === 'redo') revision++;
      return { ...base(), content: content() };
    },
    dispose() {},
  };
  bindRuntimeAdmission(
    runtime,
    async (m, c, admit) => {
      admit();
      return runtime.request(m, c);
    },
    () => true,
  );
  const editor = createEditor({
    runtimeFactory: () => {
      const owned = { ...runtime };
      bindRuntimeAdmission(
        owned,
        async (m, c, admit) => {
          admit();
          return owned.request(m, c);
        },
        () => true,
      );
      return owned;
    },
  });
  return {
    editor,
    messages,
    load: () => editor.load(new Uint8Array([1]), { format }),
    mismatch: () => {
      mismatch = true;
    },
    session: (s: string) => {
      session = s;
    },
    block: (p: Promise<void>) => {
      block = p;
    },
    application: (a: typeof application) => {
      application = a;
    },
  };
}
for (const format of ['hwp5', 'hwpx'] as const) {
  test(`controlled ${format}: public issued logical target uses SPLICE_TEXT and canonical FIFO without paragraph`, async () => {
    const c = controlled(format);
    try {
      await c.load();
      const before = c.editor.getEditorState();
      const target = await c.editor.getCreatedCellTextTarget(selector, range);
      assert.equal(c.editor.getEditorState(), before);
      assert.equal(target.text, '앞😀뒤');
      assert(Object.isFrozen(target));
      assert.equal(Object.hasOwn(target, 'paragraph'), false);
      assert.equal(Object.hasOwn(target, 'reference'), false);
      const answer = await c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
        target,
        text: '가',
        insertion: { character: { underline: { kind: 'bottom' }, strike: { enabled: true } } },
      });
      assert.equal(answer.status, 'committed-with-snapshot');
      const writes = c.messages.filter((m) => m.kind === 'created-cell-splice');
      assert.equal(writes.length, 1);
      assert.equal(writes[0].identity, selector.identity);
      assert.equal(Object.hasOwn(writes[0], 'paragraph'), false);
      assert.deepEqual(writes[0].headlessBinding, { session: 'logical-session', revision: 4 });
      assert.equal(writes[0].insertion.character.underline.kind, 'bottom');
      assert.equal(Object.hasOwn(writes[0], 'reference'), format === 'hwp5');
      const old = await c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'D' });
      assert.equal(old.status, 'rejected-unapplied');
      assert.match(old.error ?? '', /Stale/);
      assert.equal(c.messages.filter((m) => m.kind === 'created-cell-splice').length, 1);
    } finally {
      await c.editor.dispose();
    }
  });
}
test('controlled copied target and foreign editor target cannot authorize writes', async () => {
  const a = controlled(),
    b = controlled();
  try {
    await a.load();
    await b.load();
    const target = await a.editor.getCreatedCellTextTarget(selector, range);
    const copy = await a.editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: { ...target },
      text: 'D',
    });
    assert.equal(copy.status, 'rejected-unapplied');
    assert.match(copy.error ?? '', /Foreign/);
    const foreign = await b.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'D' });
    assert.equal(foreign.status, 'rejected-unapplied');
    assert.equal(
      [...a.messages, ...b.messages].filter((m) => m.kind === 'created-cell-splice').length,
      0,
    );
  } finally {
    await a.editor.dispose();
    await b.editor.dispose();
  }
});
test('controlled invalid UTF16 range, stale Native observation, unknown selector keys fail before mutation', async () => {
  const c = controlled();
  try {
    await c.load();
    await assert.rejects(
      c.editor.getCreatedCellTextTarget(selector, { startUnit: 2, endUnit: 2 }),
      /InvalidTextPosition/,
    );
    assert.throws(
      () => c.editor.getCreatedCellTextTarget({ ...selector, paragraph: 0 } as any, range),
      /InvalidCreatedCell/,
    );
    c.mismatch();
    await assert.rejects(c.editor.getCreatedCellTextTarget(selector, range), /StaleCreatedCell/);
    assert.equal(c.messages.filter((m) => m.kind === 'created-cell-splice').length, 0);
  } finally {
    await c.editor.dispose();
  }
});
test('controlled readonly document cannot issue typing authority', async () => {
  const c = controlled('hwpx', true);
  try {
    await c.load();
    await assert.rejects(c.editor.getCreatedCellTextTarget(selector, range), /ReadOnly/);
    assert.equal(c.messages.filter((m) => m.kind === 'created-cell-text-target').length, 0);
  } finally {
    await c.editor.dispose();
  }
});
test('controlled update collector preserves issued target identity and rejects second stale write', async () => {
  const c = controlled();
  try {
    await c.load();
    const target = await c.editor.getCreatedCellTextTarget(selector, range);
    await c.editor.update((tx) => {
      tx.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'A' });
      tx.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'B' });
    });
    assert.equal(c.messages.filter((m) => m.kind === 'created-cell-splice').length, 1);
  } finally {
    await c.editor.dispose();
  }
});
test('controlled queued duplicate writes share FIFO and cannot reuse one revision', async () => {
  const c = controlled();
  try {
    await c.load();
    const target = await c.editor.getCreatedCellTextTarget(selector, range);
    const answers = await Promise.all([
      c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'A' }),
      c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'B' }),
    ]);
    assert.deepEqual(
      answers.map((a) => a.status),
      ['committed-with-snapshot', 'rejected-unapplied'],
    );
    assert.equal(c.messages.filter((m) => m.kind === 'created-cell-splice').length, 1);
  } finally {
    await c.editor.dispose();
  }
});
test('controlled reload invalidates previously issued authority', async () => {
  const c = controlled();
  try {
    await c.load();
    const target = await c.editor.getCreatedCellTextTarget(selector, range);
    await c.load();
    const answer = await c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'D' });
    assert.equal(answer.status, 'rejected-unapplied');
    assert.equal(c.messages.filter((m) => m.kind === 'created-cell-splice').length, 0);
  } finally {
    await c.editor.dispose();
  }
});
test('controlled insertion cannot smuggle paragraph/reset formatting or malformed text', async () => {
  const c = controlled();
  try {
    await c.load();
    const target = await c.editor.getCreatedCellTextTarget(selector, range);
    assert.throws(
      () =>
        c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
          target,
          text: 'x',
          insertion: { paragraph: {} },
        } as any),
      /InvalidCreatedCell/,
    );
    assert.throws(
      () => c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: '\ud800' }),
      /InvalidText/,
    );
    assert.equal(c.messages.filter((m) => m.kind === 'created-cell-splice').length, 0);
  } finally {
    await c.editor.dispose();
  }
});
test('controlled unapplied and unknown results do not get automatic retries', async () => {
  for (const outcome of ['unapplied', 'unknown'] as const) {
    const c = controlled();
    try {
      await c.load();
      const target = await c.editor.getCreatedCellTextTarget(selector, range);
      c.application(outcome);
      const result = await c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'D' });
      assert.equal(
        result.status,
        outcome === 'unapplied' ? 'rejected-unapplied' : 'committed-refresh-required',
      );
      assert.equal(c.messages.filter((m) => m.kind === 'created-cell-splice').length, 1);
    } finally {
      await c.editor.dispose();
    }
  }
});
test('controlled pending target query cannot survive dispose or mutate after lifetime ends', async () => {
  const c = controlled();
  await c.load();
  let release!: () => void;
  c.block(
    new Promise<void>((r) => {
      release = r;
    }),
  );
  const query = c.editor.getCreatedCellTextTarget(selector, range);
  const rejected = assert.rejects(query, /Disposed/);
  while (!c.messages.some((m) => m.kind === 'created-cell-text-target'))
    await new Promise<void>((r) => setImmediate(r));
  const closing = c.editor.dispose();
  release();
  await rejected;
  await closing;
  assert.equal(c.messages.filter((m) => m.kind === 'created-cell-splice').length, 0);
});
test('controlled empty logical cell accepts zero range but never an oversized identity', async () => {
  const c = controlled('hwpx', false, '');
  try {
    await c.load();
    const target = await c.editor.getCreatedCellTextTarget(selector, { startUnit: 0, endUnit: 0 });
    const answer = await c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: '' });
    assert.equal(answer.status, 'committed-with-snapshot');
    assert.throws(
      () =>
        c.editor.getCreatedCellTextTarget({ ...selector, identity: '18446744073709551616' }, range),
      /InvalidCreatedCell/,
    );
    assert.throws(
      () => c.editor.getCreatedCellTextTarget({ ...selector, identity: '01' }, range),
      /InvalidCreatedCell/,
    );
  } finally {
    await c.editor.dispose();
  }
});
test('controlled undo/redo invalidate target before a fresh query issues the next authority', async () => {
  const c = controlled();
  try {
    await c.load();
    const target = await c.editor.getCreatedCellTextTarget(selector, range);
    await c.editor.undo();
    await c.editor.redo();
    const stale = await c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'D' });
    assert.equal(stale.status, 'rejected-unapplied');
    const fresh = await c.editor.getCreatedCellTextTarget(selector, range);
    const next = await c.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target: fresh, text: 'D' });
    assert.equal(next.status, 'committed-with-snapshot');
    assert.equal(c.messages.filter((m) => m.kind === 'created-cell-splice').length, 1);
  } finally {
    await c.editor.dispose();
  }
});
test('controlled target query is reserved from generic experimental dispatch', async () => {
  const c = controlled();
  try {
    await c.load();
    assert.throws(
      () =>
        c.editor.requestExperimental({ kind: 'created-cell-text-target', selector }, {
          mutation: false,
        } as any),
      /UseTypedEditorOperation/,
    );
  } finally {
    await c.editor.dispose();
  }
});
