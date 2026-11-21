import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, RESIZE_PICTURE_ANCHORED_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import { PICTURE_RESIZE_ANCHORS } from '../../src/index.ts';
import {
  checkedPictureResizeBefore,
  checkedPictureResizeRequest,
} from '../../../../js/picture-anchored-resize-transport.mjs';
import type { EditorRuntime, RuntimeReply } from '../../src/contracts.ts';

const selector = { section: 0, pictureNode: 17 };
const owner = (format = 'hwpx', historyRevision = 0): any =>
  format === 'hwp5'
    ? {
        profileVersion: 1,
        format,
        ...selector,
        width: 100,
        height: 80,
        horizontalOffset: -10,
        verticalOffset: 20,
        historyRevision,
        lease: '18446744073709551615',
      }
    : {
        profileVersion: 1,
        expected: {
          ...selector,
          size: [100, 80],
          offsets: [-10, 20],
          sourceSha256: Array(32).fill(1),
          serial: '18446744073709551615',
        },
        binding: { session: 'session', revision: historyRevision },
      };
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
      if (message.kind === 'picture-anchored-resize-query') {
        await options.onQuery?.();
        return {
          ...base,
          pictureResizeBefore: options.unavailable
            ? null
            : {
                ...owner(format, revision),
                ...options.ownerPatch,
              },
          reason: 'PictureReplacementUnavailable',
        };
      }
      if (message.kind === 'picture-anchored-resize-set') {
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
  return {
    editor,
    calls,
    writes: () => calls.filter((c) => c.kind === 'picture-anchored-resize-set'),
  };
}

async function read(h: Awaited<ReturnType<typeof setup>>) {
  const r = await h.editor.getAnchoredPictureResize(selector);
  assert.equal(r.state, 'available');
  if (r.state !== 'available') throw Error('MissingTarget');
  return r;
}
const payload = (target: any, anchor: any = 'bottom_right') => ({
  target,
  width: 120,
  height: 90,
  anchor,
});
for (const format of ['hwp5', 'hwpx'] as const) {
  test(`${format} all eight anchors transport one exact private witness and one command`, async () => {
    const h = await setup({ format });
    try {
      for (const anchor of PICTURE_RESIZE_ANCHORS) {
        const r = await read(h);
        assert(Object.isFrozen(r.observation));
        assert.deepEqual(Object.keys(r.target), []);
        assert.equal('lease' in r.observation, false);
        assert.equal('expected' in r.observation, false);
        assert.equal(r.observation.horizontalOffset, -10);
        const count = h.writes().length;
        const result = await h.editor.dispatchCommand(
          RESIZE_PICTURE_ANCHORED_COMMAND,
          payload(r.target, anchor),
        );
        assert.equal(result.status, 'committed-with-snapshot');
        assert.equal(h.writes().length, count + 1);
        const request = h.writes().at(-1)!.request as any;
        assert.equal(request.anchor, anchor);
        assert.deepEqual(request.before, owner(format, count));
        assert.equal(
          (await h.editor.dispatchCommand(RESIZE_PICTURE_ANCHORED_COMMAND, payload(r.target)))
            .status,
          'rejected-unapplied',
        );
        assert.equal(h.writes().length, count + 1);
      }
    } finally {
      await h.editor.dispose();
    }
  });
  test(`${format} forged or copied target cannot write; newer query revokes earlier lease`, async () => {
    const h = await setup({ format });
    try {
      const r = await read(h);
      for (const target of [{}, structuredClone(r.target), r.observation])
        assert.equal(
          (await h.editor.dispatchCommand(RESIZE_PICTURE_ANCHORED_COMMAND, payload(target))).status,
          'rejected-unapplied',
        );
      await read(h);
      assert.equal(
        (await h.editor.dispatchCommand(RESIZE_PICTURE_ANCHORED_COMMAND, payload(r.target))).status,
        'rejected-unapplied',
      );
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
  test(`${format} strict cloned witness preserves u64; hostile arrays/fields rejected`, () => {
    const n = owner(format);
    assert.deepEqual(checkedPictureResizeBefore(structuredClone(n), format), n);
    assert.throws(() => checkedPictureResizeBefore({ ...n, extra: true }, format));
    assert.throws(() =>
      checkedPictureResizeRequest(
        { before: n, width: 0, height: 1, anchor: 'bottom_right' },
        format,
      ),
    );
    if (format === 'hwpx') {
      for (const sourceSha256 of [Array(32), Array(31).fill(0), [...Array(31).fill(0), 256]])
        assert.throws(() =>
          checkedPictureResizeBefore({ ...n, expected: { ...n.expected, sourceSha256 } }, format),
        );
      assert.throws(() =>
        checkedPictureResizeBefore(
          { ...n, expected: { ...n.expected, serial: '18446744073709551616' } },
          format,
        ),
      );
    } else {
      for (const lease of ['0', '01', '18446744073709551616', 1])
        assert.throws(() => checkedPictureResizeBefore({ ...n, lease }, format));
    }
  });
}
test('read-only, limited, protocol1, unsupported transport and optional absence refuse without writes', async () => {
  for (const options of [
    { readOnly: true },
    { limited: true },
    { protocol: 1 as const },
    { atomic: false },
    { unavailable: true },
  ]) {
    const h = await setup(options);
    try {
      assert.equal((await h.editor.getAnchoredPictureResize(selector)).state, 'unavailable');
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  }
});
test('query rejects wrong native selector/revision and before-only observation is never a target', async () => {
  for (const ownerPatch of [
    { expected: { ...owner().expected, pictureNode: 18 } },
    { binding: { session: 'session', revision: 1 } },
    { extra: true },
  ]) {
    const h = await setup({ ownerPatch });
    try {
      await assert.rejects(h.editor.getAnchoredPictureResize(selector));
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  }
});
test('raw experimental anchored operations require typed API', async () => {
  const h = await setup();
  try {
    for (const kind of ['picture-anchored-resize-query', 'picture-anchored-resize-set'])
      assert.throws(
        () =>
          h.editor.requestExperimental(
            { kind },
            { mutation: kind.endsWith('set'), token: h.editor.getEditorState().token },
          ),
        /UseTypedEditorOperation/,
      );
  } finally {
    await h.editor.dispose();
  }
});
test('runtime admission revoked while querying does not issue write authority', async () => {
  let admitted = true;
  const h = await setup({
    admitted: () => admitted,
    onQuery: async () => {
      admitted = false;
    },
  });
  try {
    await assert.rejects(
      h.editor.getAnchoredPictureResize(selector),
      /UnsupportedAnchoredPictureResizeRuntime/,
    );
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('payload mutation after dispatch is captured; invalid size/anchor cannot enqueue', async () => {
  const h = await setup();
  try {
    const r = await read(h);
    for (const patch of [{ width: -0 }, { height: 0 }, { anchor: 'nw' }, { width: 0x100000000 }]) {
      assert.throws(
        () =>
          h.editor.dispatchCommand(RESIZE_PICTURE_ANCHORED_COMMAND, {
            ...payload(r.target),
            ...patch,
          }),
        /InvalidAnchoredPictureResize/,
      );
    }
    const p = payload(r.target);
    const done = h.editor.dispatchCommand(RESIZE_PICTURE_ANCHORED_COMMAND, p);
    p.width = 999;
    await done;
    assert.equal((h.writes()[0].request as any).width, 120);
  } finally {
    await h.editor.dispose();
  }
});

test('cross-editor target and queued selection change refuse before write', async () => {
  const a = await setup(),
    b = await setup();
  try {
    const other = await read(b);
    assert.equal(
      (await a.editor.dispatchCommand(RESIZE_PICTURE_ANCHORED_COMMAND, payload(other.target)))
        .status,
      'rejected-unapplied',
    );
    const r = await read(a);
    const selection = a.editor.setSelection(null);
    const pending = a.editor.dispatchCommand(RESIZE_PICTURE_ANCHORED_COMMAND, payload(r.target));
    await selection;
    assert.equal((await pending).status, 'rejected-unapplied');
    assert.equal(a.writes().length, 0);
  } finally {
    await a.editor.dispose();
    await b.editor.dispose();
  }
});
test('runtime replacement/taint after observation refuses without writing', async () => {
  let admitted = true;
  const h = await setup({ admitted: () => admitted });
  try {
    const r = await read(h);
    admitted = false;
    assert.equal(
      (await h.editor.dispatchCommand(RESIZE_PICTURE_ANCHORED_COMMAND, payload(r.target))).status,
      'rejected-unapplied',
    );
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
for (const [name, reply, status] of [
  [
    'no-op',
    {
      applied: false,
      changed: false,
      historyRevision: 0,
      content: undefined,
      meta: { application: 'unapplied', changed: false },
    },
    'known-no-op',
  ],
  [
    'projection failure',
    { content: undefined, error: 'ProjectionFailed' },
    'committed-refresh-required',
  ],
  [
    'unapplied error',
    {
      applied: false,
      changed: false,
      error: 'RejectedByNative',
      content: undefined,
      meta: { application: 'unapplied', changed: false },
    },
    'rejected-unapplied',
  ],
  [
    'unknown',
    {
      applied: false,
      changed: false,
      error: 'MutationUncertain',
      content: undefined,
      historyPoisoned: true,
      meta: { application: 'unknown', changed: null },
    },
    'committed-refresh-required',
  ],
] as const)
  test(`Native ${name} classified without replay or fallback`, async () => {
    const h = await setup({ reply: reply as Partial<RuntimeReply> });
    try {
      const r = await read(h);
      const result = await h.editor.dispatchCommand(
        RESIZE_PICTURE_ANCHORED_COMMAND,
        payload(r.target),
      );
      assert.equal(result.status, status);
      assert.equal(h.writes().length, 1);
      if (name === 'no-op') assert.equal(result.state.nativeHistoryRevision, 0);
      if (name === 'unknown') assert.equal(result.state.historyRecoveryRequired, true);
      try {
        await h.editor.dispatchCommand(RESIZE_PICTURE_ANCHORED_COMMAND, payload(r.target));
      } catch {}
      assert.equal(h.writes().length, 1);
      assert.equal(
        h.calls.some((c) =>
          [
            'picture-resize',
            'picture-dimensions',
            'picture-position',
            'object-geometry-set',
          ].includes(c.kind),
        ),
        false,
      );
    } finally {
      await h.editor.dispose();
    }
  });

test('a second pending read revokes the first query generation before target issuance', async () => {
  let release!: () => void, started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0;
  const h = await setup({
    onQuery: async () => {
      if (++count === 1) {
        started();
        await held;
      }
    },
  });
  try {
    const first = h.editor.getAnchoredPictureResize(selector);
    const rejected = assert.rejects(first, /StalePictureAnchoredResizeTarget/);
    await begun;
    const second = h.editor.getAnchoredPictureResize(selector);
    release();
    await rejected;
    const current = await second;
    assert.equal(current.state, 'available');
    assert.equal(h.writes().length, 0);
  } finally {
    release();
    await h.editor.dispose();
  }
});
