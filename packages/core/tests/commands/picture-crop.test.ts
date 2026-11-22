import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, SET_PICTURE_CROP_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import type { EditorRuntime, RuntimeReply } from '../../src/contracts.ts';

const selector = { section: 0, pictureNode: 17 };
const owner = (format = 'hwpx', historyRevision = 0) => ({
  profileVersion: 1,
  leaseKey: '1',
  crop: { left: 0, top: 0, right: 4800, bottom: 2400 },
  bounds: { width: 4800, height: 2400, basis: 'explicit_pair' },
  format,
  ...selector,
  historyRevision,
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
      if (message.kind === 'picture-crop-query') {
        await options.onQuery?.();
        return {
          ...base,
          pictureCrop: options.unavailable
            ? null
            : {
                ...owner(format, revision),
                ...options.ownerPatch,
              },
          reason: 'PictureCropUnavailable',
        };
      }
      if (message.kind === 'picture-crop-set') {
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
  return { editor, calls, writes: () => calls.filter((c) => c.kind === 'picture-crop-set') };
}

const crop = { left: 101, top: 207, right: 3101, bottom: 1807 };
async function target(editor: ReturnType<typeof createEditor>) {
  const r = await editor.getPictureCrop(selector);
  assert.equal(r.state, 'available');
  if (r.state !== 'available') throw Error('Unavailable');
  assert(!('leaseKey' in r.observation));
  return r.target;
}
for (const format of ['hwp5', 'hwpx'] as const)
  test(`${format} crop current opaque target commits once with named edges`, async () => {
    const h = await setup({ format });
    try {
      const t = await target(h.editor);
      const r = await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: t, crop });
      assert.equal(r.status, 'committed-with-snapshot');
      assert.equal(h.writes().length, 1);
      assert.deepEqual(h.writes()[0].crop, crop);
      assert.equal(h.writes()[0].leaseKey, '1');
      const again = await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: t, crop });
      assert.equal(again.status, 'rejected-unapplied');
      assert.equal(h.writes().length, 1);
    } finally {
      await h.editor.dispose();
    }
  });
test('forged cloned and cross-editor crop targets never dispatch', async () => {
  const a = await setup(),
    b = await setup();
  try {
    const t = await target(a.editor),
      foreign = await target(b.editor);
    for (const value of [{}, structuredClone(t), foreign]) {
      const r = await a.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: value, crop });
      assert.equal(r.status, 'rejected-unapplied');
    }
    assert.equal(a.writes().length, 0);
  } finally {
    await a.editor.dispose();
    await b.editor.dispose();
  }
});
test('state change and second query invalidate prior crop targets', async () => {
  const h = await setup();
  try {
    const a = await target(h.editor);
    await target(h.editor);
    assert.equal(
      (await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: a, crop })).status,
      'rejected-unapplied',
    );
    const b = await target(h.editor);
    await h.editor.setSelection(null);
    assert.equal(
      (await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: b, crop })).status,
      'rejected-unapplied',
    );
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('missing optional capability readOnly limited history1 and unqualified runtime refuse', async () => {
  for (const options of [
    { unavailable: true },
    { readOnly: true },
    { limited: true },
    { protocol: 1 as const },
    { atomic: false },
  ]) {
    const h = await setup(options);
    try {
      assert.equal((await h.editor.getPictureCrop(selector)).state, 'unavailable');
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  }
});
test('wrong owner format node revision and malformed bounds cannot issue crop target', async () => {
  for (const ownerPatch of [
    { pictureNode: 99 },
    { format: 'other' },
    { historyRevision: 3 },
    { bounds: { width: 0, height: 1, basis: 'explicit_pair' } },
  ]) {
    const h = await setup({ ownerPatch });
    try {
      await assert.rejects(h.editor.getPictureCrop(selector));
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  }
});
test('admission revoked after capture refuses before Native commit', async () => {
  let admitted = true;
  const h = await setup({ admitted: () => admitted });
  try {
    const t = await target(h.editor);
    admitted = false;
    assert.equal(
      (await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: t, crop })).status,
      'rejected-unapplied',
    );
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('release is exact target only and does not retire newer capture', async () => {
  const h = await setup();
  try {
    const a = await target(h.editor),
      b = await target(h.editor);
    await h.editor.releasePictureCrop(a);
    assert.equal(
      (await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: b, crop })).status,
      'committed-with-snapshot',
    );
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('raw experimental resource and surface channels cannot expose private crop leases', async () => {
  const h = await setup();
  try {
    for (const kind of ['picture-crop-query', 'picture-crop-set', 'picture-crop-release']) {
      await assert.rejects(async () =>
        h.editor.requestExperimental(
          { kind },
          { mutation: kind === 'picture-crop-set', token: h.editor.getEditorState().token },
        ),
      );
      await assert.rejects(h.editor.readResource({ kind }));
    }
  } finally {
    await h.editor.dispose();
  }
});
test('pending query callback cannot reassign authority after newer query begins', async () => {
  let unblock!: () => void;
  let seen = 0;
  const ready = new Promise<void>((resolve) => (unblock = resolve));
  const h = await setup({
    onQuery: async () => {
      if (++seen === 1) await ready;
    },
  });
  try {
    const first = h.editor.getPictureCrop(selector);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = h.editor.getPictureCrop(selector);
    unblock();
    await assert.rejects(first, /StalePictureCrop/);
    assert.equal(h.calls.filter((c) => c.kind === 'picture-crop-release').length, 1);
    assert.equal((await second).state, 'available');
  } finally {
    await h.editor.dispose();
  }
});

test('same-crop Native no-op after undo preserves the existing redo entry', async () => {
  const options: Options = {};
  const h = await setup(options);
  try {
    const first = await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, {
      target: await target(h.editor),
      crop,
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
    const noOp = await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, {
      target: await target(h.editor),
      crop,
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
test('predictable Native rejection keeps prior redo and never replays crop command', async () => {
  const options: Options = {};
  const h = await setup(options);
  try {
    await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, {
      target: await target(h.editor),
      crop,
    });
    await h.editor.undo();
    options.reply = {
      applied: false,
      changed: false,
      error: 'ProtectedPicture',
      content: undefined,
      meta: { application: 'unapplied', changed: false },
    };
    const r = await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, {
      target: await target(h.editor),
      crop,
    });
    assert.equal(r.status, 'rejected-unapplied');
    assert.equal(r.state.nativeHistoryRevision, 0);
    assert.equal(r.state.nativeHistoryStats?.redoCount, 1);
    assert.equal(h.writes().length, 2);
    await h.editor.redo();
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 1);
  } finally {
    await h.editor.dispose();
  }
});

test('malformed second query preserves an already issued valid grant', async () => {
  const h = await setup();
  try {
    const t = await target(h.editor);
    for (const invoke of [
      () => h.editor.getPictureCrop({ section: -1, pictureNode: 17 }),
      () => h.editor.getPictureCrop(selector, { token: null as never }),
      () => h.editor.getPictureCrop(selector, { unexpected: 1 } as never),
      () => h.editor.getPictureCrop(selector, { token: {} as never }),
    ])
      assert.throws(invoke);
    assert.equal(
      (await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: t, crop })).status,
      'committed-with-snapshot',
    );
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('malformed second query cannot retire the first pending Native capture', async () => {
  let unblock!: () => void;
  const wait = new Promise<void>((resolve) => (unblock = resolve));
  const h = await setup({ onQuery: () => wait });
  try {
    const pending = h.editor.getPictureCrop(selector);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.throws(() => h.editor.getPictureCrop(selector, { token: null as never }));
    unblock();
    assert.equal((await pending).state, 'available');
    assert.equal(h.calls.filter((c) => c.kind === 'picture-crop-release').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('host-invalid crop does not consume Core target before a later valid command', async () => {
  const h = await setup();
  try {
    const t = await target(h.editor);
    const r = await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, {
      target: t,
      crop: { ...crop, right: 4801 },
    });
    assert.equal(r.status, 'rejected-unapplied');
    assert.equal(h.writes().length, 0);
    assert.equal(
      (await h.editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: t, crop })).status,
      'committed-with-snapshot',
    );
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
