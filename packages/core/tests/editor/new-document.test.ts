import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import type { RuntimeFactory, RuntimeMessage } from '../../src/contracts.ts';
import { createParagraphSelection } from '../../src/state/paragraph-selection.ts';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function setup(
  produce: NonNullable<RuntimeFactory['createDocumentBytes']>,
  row: Record<string, unknown> = {},
) {
  const messages: RuntimeMessage[] = [];
  let creates = 0,
    closes = 0;
  const factory: RuntimeFactory = Object.assign(
    () => {
      creates++;
      let format = 'hwpx';
      return {
        async request(message: RuntimeMessage) {
          messages.push(structuredClone(message));
          if (message.kind === 'load') format = String(message.format);
          return {
            kind: message.kind,
            historyRevision: 0,
            historyRevisions: [0],
            content: {
              format,
              paragraphs: [
                {
                  section: 0,
                  paragraph: 0,
                  text: '',
                  editable: true,
                  selectionOwner: 'section:0:body',
                  ...row,
                },
              ],
            },
          };
        },
        dispose() {
          closes++;
        },
      };
    },
    { createDocumentBytes: produce },
  );
  const editor = createEditor({ runtimeFactory: factory });
  return {
    editor,
    messages,
    get creates() {
      return creates;
    },
    get closes() {
      return closes;
    },
  };
}
for (const format of ['hwpx', 'hwp5'] as const)
  test(`new ${format} uses one load/enable candidate and clears owned bytes`, async () => {
    const bytes = new Uint8Array([7, 8]);
    const formats: string[] = [];
    const f = setup(async (value) => {
      formats.push(value);
      return bytes;
    });
    try {
      const history = { maxEntries: 12 };
      const state = await f.editor.createDocument({ format, history });
      assert.equal(state.status, 'ready');
      assert.equal(state.operationRevision, state.savedOperationRevision);
      assert.deepEqual(state.nativeHistoryRevisions, [0]);
      assert.deepEqual(formats, [format]);
      assert.deepEqual(
        f.messages.map((m) => m.kind),
        ['load', 'enable'],
      );
      assert.equal(f.messages[0].format, format);
      assert.deepEqual(f.messages[0].bytes, new Uint8Array([7, 8]));
      assert.deepEqual(f.messages[1].history, history);
      assert.deepEqual(bytes, new Uint8Array([0, 0]));
      assert.equal(f.creates, 1);
      await f.editor.setSelection(
        createParagraphSelection(state, { section: 0, paragraph: 0, startUnit: 0 }),
      );
      assert.equal((f.editor.getEditorState().selection as any).startUnit, 0);
    } finally {
      await f.editor.dispose();
    }
  });
test('defaults to HWPX; repeated creation owns a new document identity and empty history', async () => {
  const f = setup(async () => new Uint8Array([1]));
  try {
    const first = await f.editor.createDocument();
    const second = await f.editor.createDocument();
    assert.equal((second.content as any).format, 'hwpx');
    assert.notEqual(first.documentId, second.documentId);
    assert.ok(second.generation > first.generation);
    assert.deepEqual(second.nativeHistoryRevisions, [0]);
    assert.equal(f.closes, 1);
  } finally {
    await f.editor.dispose();
  }
});
test('constructor failure preserves current content/history/selection and never creates a candidate', async () => {
  const f = setup(async () => {
    throw Error('ConstructorOOM');
  });
  try {
    const state = await f.editor.load(new Uint8Array([1]), { format: 'hwp5' });
    const selected = await f.editor.setSelection(
      createParagraphSelection(state, { section: 0, paragraph: 0, startUnit: 0 }),
    );
    await assert.rejects(f.editor.createDocument(), /ConstructorOOM/);
    const now = f.editor.getEditorState();
    for (const key of [
      'documentId',
      'generation',
      'operationRevision',
      'savedOperationRevision',
      'content',
      'selection',
      'nativeHistoryRevisions',
    ] as const)
      assert.deepEqual(now[key], selected[key], key);
    assert.equal(now.status, 'ready');
    assert.equal(f.creates, 1);
    assert.equal(f.closes, 0);
  } finally {
    await f.editor.dispose();
  }
});
test('unsupported custom factory fails explicitly without changing the current observation', async () => {
  const editor = createEditor({
    runtimeFactory: () => {
      throw Error('ShouldNotRun');
    },
  });
  try {
    const before = editor.getEditorState();
    assert.throws(() => editor.createDocument(), /NewDocumentUnsupported/);
    assert.equal(editor.getEditorState(), before);
  } finally {
    await editor.dispose();
  }
});
test('cancel interrupts delayed construction; late bytes are cleared and cannot replace a later open', async () => {
  const entered = deferred<void>(),
    gate = deferred<Uint8Array>();
  const f = setup(async () => {
    entered.resolve();
    return gate.promise;
  });
  try {
    await f.editor.load(new Uint8Array([1]), { format: 'hwp5' });
    const creating = f.editor.createDocument();
    const rejected = assert.rejects(creating, /LoadCancelled/);
    await entered.promise;
    await f.editor.cancelLoad();
    await rejected;
    const later = await f.editor.load(new Uint8Array([2]), { format: 'hwp5' });
    const bytes = new Uint8Array([9]);
    gate.resolve(bytes);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(bytes, new Uint8Array([0]));
    assert.equal(f.editor.getEditorState().documentId, later.documentId);
    assert.equal(f.creates, 2);
  } finally {
    await f.editor.dispose();
  }
});
test('dispose interrupts delayed construction without waiting; late bytes are cleared', async () => {
  const entered = deferred<void>(),
    gate = deferred<Uint8Array>();
  const f = setup(async () => {
    entered.resolve();
    return gate.promise;
  });
  const creating = f.editor.createDocument();
  const rejected = assert.rejects(creating, /EditorDisposed|LoadCancelled/);
  await entered.promise;
  await f.editor.dispose();
  await rejected;
  const bytes = new Uint8Array([9]);
  gate.resolve(bytes);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(bytes, new Uint8Array([0]));
  assert.equal(f.creates, 0);
  assert.equal(f.editor.getEditorState().status, 'disposed');
});
test('a later open remains final when creation was queued first', async () => {
  const gate = deferred<Uint8Array>(),
    entered = deferred<void>();
  const f = setup(async () => {
    entered.resolve();
    return gate.promise;
  });
  try {
    const creating = f.editor.createDocument();
    await entered.promise;
    const opening = f.editor.load(new Uint8Array([3]), { format: 'hwp5' });
    gate.resolve(new Uint8Array([1]));
    const first = await creating,
      last = await opening;
    assert.ok(last.generation > first.generation);
    assert.equal(f.editor.getEditorState().documentId, last.documentId);
    assert.equal((last.content as any).format, 'hwp5');
  } finally {
    await f.editor.dispose();
  }
});
test('invalid bytes or format fail without committing a candidate', async () => {
  const f = setup(async () => new ArrayBuffer(1) as any);
  try {
    assert.throws(() => f.editor.createDocument({ format: 'bad' as any }), /InvalidDocumentFormat/);
    await assert.rejects(f.editor.createDocument(), /InvalidDocumentBytes/);
    assert.equal(f.creates, 0);
    assert.equal(f.editor.getEditorState().status, 'empty');
  } finally {
    await f.editor.dispose();
  }
});

test('creation shares composition admission; a blocked composition never starts the constructor', async () => {
  let produced = 0;
  const f = setup(async () => {
    produced++;
    return new Uint8Array([1]);
  });
  try {
    await f.editor.load(new Uint8Array([1]), { format: 'hwpx' });
    const hooks = {
      flushPendingInput: () => {},
      commitComposition: () => 'blocked' as const,
      cancelComposition: () => {},
    };
    f.editor.acquireInputSurface(hooks);
    await assert.rejects(f.editor.createDocument(), /CompositionBlocked/);
    assert.equal(produced, 0);
    assert.equal(f.creates, 1);
  } finally {
    await f.editor.dispose();
  }
});
test('read-only creation keeps normal load semantics and does not enable editing', async () => {
  const f = setup(async () => new Uint8Array([1]));
  try {
    const state = await f.editor.createDocument({ editable: false });
    assert.equal(state.status, 'ready');
    assert.deepEqual(
      f.messages.map((message) => message.kind),
      ['load'],
    );
    assert.equal((state.content as any).paragraphs[0].editable, false);
  } finally {
    await f.editor.dispose();
  }
});
test('options are captured before delayed construction and duplicate history is rejected before production', async () => {
  const gate = deferred<Uint8Array>(),
    entered = deferred<void>();
  let produced = 0;
  const f = setup(async () => {
    produced++;
    entered.resolve();
    return gate.promise;
  });
  try {
    assert.throws(
      () => f.editor.createDocument({ history: { maxEntries: 1 }, enableOptions: { history: {} } }),
      /DuplicateHistoryOptions/,
    );
    assert.equal(produced, 0);
    const options = { format: 'hwpx' as const, history: { maxEntries: 12 } };
    const creating = f.editor.createDocument(options);
    await entered.promise;
    options.history.maxEntries = 99;
    gate.resolve(new Uint8Array([1]));
    await creating;
    assert.deepEqual(f.messages[1].history, { maxEntries: 12 });
  } finally {
    await f.editor.dispose();
  }
});

test('reader factory exposes construction separately and leaves runtime descriptors canonical', async () => {
  const { createReaderRuntimeFactory } = await import('../../src/runtime/reader-runtime.ts');
  const factory = createReaderRuntimeFactory();
  assert.equal(typeof factory.createDocumentBytes, 'function');
  await assert.rejects(factory.createDocumentBytes!('hwpx'), /ExplicitWasmRequired/);
  const runtime = await factory();
  assert.deepEqual(Object.keys(runtime).sort(), ['dispose', 'request']);
  await runtime.dispose();
});

for (const [format, row, startUnit] of [
  [
    'hwp5',
    {
      text: '\ufffc\ufffc',
      currentReference: {
        epoch: '2',
        kind: 'original',
        section: 0,
        id: '0',
        row: 0,
        column: 0,
        scope: '1',
      },
      structuralAnchors: [
        {
          kind: 'section',
          control_node: 3,
          paragraph: 0,
          source_unit: 0,
          current_unit: 0,
          unit: 0,
        },
        { kind: 'column', control_node: 5, paragraph: 0, source_unit: 8, current_unit: 8, unit: 1 },
      ],
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 1, source: 8 },
        { at: 2, source: 16 },
      ],
    },
    2,
  ],
  ['hwpx', { text: '' }, 0],
] as const)
  test(`${format} publishes the initial caret with the document in one ready commit`, async () => {
    const f = setup(async () => new Uint8Array([1]), row);
    const updates: ReturnType<typeof f.editor.getEditorState>[] = [];
    f.editor.registerUpdateListener((state) => {
      updates.push(state);
    });
    try {
      const state = await f.editor.createDocument({ format });
      const target = state.selection as any;
      assert.equal(updates.length, 1);
      assert.equal(updates[0], state);
      assert.ok(target);
      assert.equal(target.startUnit, startUnit);
      assert.equal(target.endUnit, startUnit);
      assert.equal(target.coordinateSpace, 'display');
      assert.equal(target.owner, 'section:0:body');
      for (const key of [
        'editorId',
        'documentId',
        'generation',
        'operationRevision',
        'viewRevision',
      ] as const)
        assert.equal(target[key], state[key], key);
      assert.equal(state.savedOperationRevision, state.operationRevision);
      assert.deepEqual(state.nativeHistoryRevisions, [0]);
      const { selectionMessage } = await import('../../src/commands/selection.ts');
      assert.equal(selectionMessage(target, state).startUnit, format === 'hwp5' ? 16 : 0);
      assert.deepEqual(
        f.messages.map((message) => message.kind),
        ['load', 'enable'],
      );
    } finally {
      await f.editor.dispose();
    }
  });
test('generic load never initializes the authored HWP5 structural-prefix caret', async () => {
  const f = setup(async () => new Uint8Array([1]), {
    text: '\ufffc\ufffc',
    sourceOffsets: [
      { at: 0, source: 0 },
      { at: 1, source: 8 },
      { at: 2, source: 16 },
    ],
  });
  try {
    const state = await f.editor.load(new Uint8Array([1]), { format: 'hwp5' });
    assert.equal(state.selection, undefined);
  } finally {
    await f.editor.dispose();
  }
});
test('unverified custom HWP5 empty observation has no guessed caret', async () => {
  const f = setup(async () => new Uint8Array([1]));
  try {
    assert.equal((await f.editor.createDocument({ format: 'hwp5' })).selection, undefined);
  } finally {
    await f.editor.dispose();
  }
});
