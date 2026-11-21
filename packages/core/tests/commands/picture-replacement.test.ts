import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, REPLACE_PICTURE_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import type { EditorRuntime, RuntimeReply } from '../../src/contracts.ts';

const selector = { section: 0, pictureNode: 17 };
const owner = (format = 'hwpx', historyRevision = 0) => ({
  format,
  ...selector,
  pictureIdentity: 'picture17',
  resourceLink: 'image1',
  sourceSha256: Array(32).fill(1),
  resourceSha256: Array(32).fill(2),
  historyRevision,
  binding: { session: 'current-session', serial: '1' },
});
type Options = {
  format?: 'hwp5' | 'hwpx';
  readOnly?: boolean;
  limited?: boolean;
  protocol?: 1 | 2;
  atomic?: boolean;
  unavailable?: boolean;
  ownerPatch?: object;
  reply?: Partial<RuntimeReply>;
  admitted?: () => boolean;
  onQuery?: () => Promise<void>;
};
// Private synthetic adapter tests Core admission and FIFO; it does not qualify a Native module.
async function setup(options: Options = {}) {
  const calls: { kind: string; [key: string]: unknown }[] = [];
  let revision = 0,
    closed = false,
    undoCount = 0,
    redoCount = 0;
  const format = options.format ?? 'hwpx';
  const content = () => ({
    format,
    readOnly: !!options.readOnly,
    limited: !!options.limited,
    totalParagraphs: 1,
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: '\ufffc',
        editable: true,
        selectionOwner: 'section:0:body',
      },
    ],
  });
  const runtime: EditorRuntime = {
    async request(message, context): Promise<RuntimeReply> {
      calls.push(message);
      if (message.kind === 'undo' && undoCount) {
        revision--;
        undoCount--;
        redoCount++;
      }
      if (message.kind === 'redo' && redoCount) {
        revision++;
        undoCount++;
        redoCount--;
      }
      const base = {
        kind: message.kind,
        historyRevision: revision,
        historyStats: {
          protocolVersion: options.protocol ?? 2,
          requested: {},
          resolved: {},
          retainedBytes: null,
          metadataOwnedBytes: null,
          currentOwnedBytes: null,
          undoOwnedBytes: null,
          redoOwnedBytes: null,
          evictedCount: null,
          undoCount,
          redoCount,
        },
        meta: { context, application: 'unapplied' as const, changed: false },
      };
      if (message.kind === 'picture-replacement-query') {
        await options.onQuery?.();
        return {
          ...base,
          pictureOwner: options.unavailable
            ? null
            : {
                ...owner(format, revision),
                ...options.ownerPatch,
              },
          reason: 'PictureReplacementUnavailable',
        };
      }
      if (message.kind === 'picture-replace') {
        if (options.reply?.changed !== false) {
          revision++;
          undoCount++;
          redoCount = 0;
        }
        return {
          ...base,
          meta: { context, application: 'applied', changed: true },
          changed: true,
          applied: true,
          content: content(),
          historyRevision: revision,
          historyStats: { ...base.historyStats, undoCount, redoCount },
          ...options.reply,
        };
      }
      if (message.kind === 'undo' || message.kind === 'redo')
        return {
          ...base,
          content: content(),
          meta: { context, application: 'applied', changed: true },
          changed: true,
          applied: true,
        };
      return { ...base, content: content() };
    },
    dispose() {
      closed = true;
    },
  };
  if (options.atomic !== false)
    bindRuntimeAdmission(
      runtime,
      async (m, c, admit) => {
        admit();
        return runtime.request(m, c);
      },
      () => !closed && (options.admitted?.() ?? true),
    );
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format, editable: true });
  return { editor, calls, writes: () => calls.filter((c) => c.kind === 'picture-replace') };
}
async function target(editor: ReturnType<typeof createEditor>) {
  const read = await editor.getPictureReplacement(selector);
  assert.equal(read.state, 'available');
  if (read.state !== 'available') throw Error('ExpectedOwnedTarget');
  assert.deepEqual(Object.keys(read).sort(), ['observation', 'state', 'target']);
  assert.deepEqual(Object.keys(read.target), []);
  assert.equal(Object.isFrozen(read.target), true);
  return read.target;
}
for (const format of ['hwp5', 'hwpx'] as const)
  test(`${format} current target sends one owned image transaction`, async () => {
    const h = await setup({ format });
    try {
      const image = new Uint8Array([1, 2, 3]);
      const pending = h.editor.dispatchCommand(REPLACE_PICTURE_COMMAND, {
        target: await target(h.editor),
        imageBytes: image,
      });
      image.fill(9);
      const result = await pending;
      assert.equal(result.status, 'committed-with-snapshot');
      assert.equal(result.state.nativeHistoryRevision, 1);
      assert.equal(h.writes().length, 1);
      assert.deepEqual(h.writes()[0].imageBytes, new Uint8Array([1, 2, 3]));
      assert.equal((h.writes()[0].owner as { pictureNode: number }).pictureNode, 17);
      assert.equal(
        h.calls.some((c) => c.kind === 'save' || c.kind === 'close'),
        false,
      );
    } finally {
      await h.editor.dispose();
    }
  });
test('copied and cross-editor targets never carry owner authority', async () => {
  const a = await setup(),
    b = await setup();
  try {
    const t = await target(a.editor);
    for (const foreign of [structuredClone(t), await target(b.editor)]) {
      const result = await a.editor.dispatchCommand(REPLACE_PICTURE_COMMAND, {
        target: foreign,
        imageBytes: new Uint8Array([1]),
      });
      assert.equal(result.status, 'rejected-unapplied');
    }
    assert.equal(a.writes().length, 0);
  } finally {
    await a.editor.dispose();
    await b.editor.dispose();
  }
});
test('selection-only state change invalidates current owner without a Native revision change', async () => {
  const h = await setup();
  try {
    const t = await target(h.editor);
    await h.editor.setSelection(null);
    assert.equal(
      (
        await h.editor.dispatchCommand(REPLACE_PICTURE_COMMAND, {
          target: t,
          imageBytes: new Uint8Array([1]),
        })
      ).status,
      'rejected-unapplied',
    );
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('queued state transition wins before write admission', async () => {
  const h = await setup();
  try {
    const t = await target(h.editor);
    const selection = h.editor.setSelection(null);
    const pending = h.editor.dispatchCommand(REPLACE_PICTURE_COMMAND, {
      target: t,
      imageBytes: new Uint8Array([1]),
    });
    await selection;
    assert.equal((await pending).status, 'rejected-unapplied');
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('admission fence refuses a runtime changed after target capture', async () => {
  let refuse = false;
  const h = await setup({ admitted: () => !refuse });
  try {
    const t = await target(h.editor);
    refuse = true;
    assert.equal(
      (
        await h.editor.dispatchCommand(REPLACE_PICTURE_COMMAND, {
          target: t,
          imageBytes: new Uint8Array([1]),
        })
      ).status,
      'rejected-unapplied',
    );
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
for (const options of [
  { readOnly: true },
  { limited: true },
  { protocol: 1 },
  { atomic: false },
] as Options[])
  test(`unsupported target gate ${JSON.stringify(options)}`, async () => {
    const h = await setup(options);
    try {
      assert.equal((await h.editor.getPictureReplacement(selector)).state, 'unavailable');
      assert.equal(h.calls.filter((c) => c.kind === 'picture-replacement-query').length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('admitted old ABI returns explicit unavailable without issuing a target', async () => {
  const h = await setup({ unavailable: true });
  try {
    assert.deepEqual(await h.editor.getPictureReplacement(selector), {
      state: 'unavailable',
      reason: 'PictureReplacementUnavailable',
    });
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
for (const patch of [
  { pictureNode: 18 },
  { format: 'hwp5' },
  { historyRevision: 1 },
  { sourceSha256: 'not-bytes' },
])
  test(`mismatched Native owner ${JSON.stringify(patch)}`, async () => {
    const h = await setup({ ownerPatch: patch });
    try {
      await assert.rejects(h.editor.getPictureReplacement(selector));
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('known no-op comes from Native and preserves history revision', async () => {
  const h = await setup({
    reply: {
      applied: false,
      changed: false,
      historyRevision: 0,
      content: undefined,
      meta: { application: 'unapplied', changed: false },
    },
  });
  try {
    const result = await h.editor.dispatchCommand(REPLACE_PICTURE_COMMAND, {
      target: await target(h.editor),
      imageBytes: new Uint8Array([1]),
    });
    assert.equal(result.status, 'known-no-op');
    assert.equal(result.state.nativeHistoryRevision, 0);
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('committed projection failure never replays Native replacement', async () => {
  const h = await setup({ reply: { content: undefined, error: 'ProjectionFailed' } });
  try {
    const result = await h.editor.dispatchCommand(REPLACE_PICTURE_COMMAND, {
      target: await target(h.editor),
      imageBytes: new Uint8Array([1]),
    });
    assert.equal(result.status, 'committed-refresh-required');
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('experimental messages cannot bypass typed picture ownership', async () => {
  const h = await setup();
  try {
    for (const kind of ['picture-replace', 'picture-replacement-query'])
      assert.throws(
        () =>
          h.editor.requestExperimental(
            { kind },
            { mutation: true, token: h.editor.getEditorState().token },
          ),
        /UseTyped/,
      );
  } finally {
    await h.editor.dispose();
  }
});

test('same-image Native no-op after undo preserves the existing redo entry', async () => {
  const options: Options = {};
  const h = await setup(options);
  try {
    const first = await h.editor.dispatchCommand(REPLACE_PICTURE_COMMAND, {
      target: await target(h.editor),
      imageBytes: new Uint8Array([1]),
    });
    assert.equal(first.status, 'committed-with-snapshot');
    await h.editor.undo();
    assert.equal(h.editor.getEditorState().nativeHistoryStats?.redoCount, 1);
    options.reply = {
      applied: false,
      changed: false,
      content: undefined,
      meta: { application: 'unapplied', changed: false },
    };
    const noOp = await h.editor.dispatchCommand(REPLACE_PICTURE_COMMAND, {
      target: await target(h.editor),
      imageBytes: new Uint8Array([1]),
    });
    assert.equal(noOp.status, 'known-no-op');
    assert.equal(noOp.state.nativeHistoryRevision, 0);
    assert.equal(noOp.state.nativeHistoryStats?.redoCount, 1);
    await h.editor.redo();
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 1);
    assert.equal(h.writes().length, 2);
  } finally {
    await h.editor.dispose();
  }
});
