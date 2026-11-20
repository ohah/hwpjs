import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import { strictLayoutSaveBridge } from '../../src/internal/strict-layout-save.ts';
import { createMeasuredPlainLayoutSaver } from '../../src/browser/strict-layout-save.ts';
import type { RuntimeFactory } from '../../src/contracts.ts';

const snapshot = () => ({
  schema: 1,
  version: 0x05000300,
  width: 10000,
  height: 10000,
  paragraphs: [
    {
      raw: [0xd55c, 0xae00, 65, 13],
      font: 'OwnFont',
      size: 1000,
      bold: false,
      italic: false,
      spacing_percent: 160,
    },
  ],
});
async function setup(options: { capability?: boolean; protocol?: number } = {}) {
  const messages: any[] = [];
  let beforeCommit: (() => void | Promise<void>) | undefined;
  let malformed = false,
    cleanupError = false,
    closes = 0;
  const factory: RuntimeFactory = Object.assign(
    () => ({
      async request(message: any, context?: any): Promise<any> {
        messages.push(structuredClone(message));
        const base = {
          kind: message.kind,
          meta: { context },
          historyRevision: 0,
          ...(message.kind === 'own-test-edit' ? { applied: true } : {}),
        };
        if (message.kind === 'strict-layout-prepare')
          return {
            ...base,
            ticket: 'owned1',
            snapshot: snapshot(),
            ...(malformed ? { meta: { context: { ...context, generation: -1 } } } : {}),
          };
        if (message.kind === 'strict-layout-commit') {
          await beforeCommit?.();
          return {
            ...base,
            bytes: new Uint8Array([7, 9]),
            format: 'hwp5',
            layoutRequiresReflow: false,
          };
        }
        if (message.kind === 'strict-layout-cancel') {
          if (cleanupError) throw Error('cleanup-failed');
          return base;
        }
        if (message.kind === 'save') return { ...base, error: 'LayoutReflowRequired' };
        return {
          ...base,
          historyStats: { protocolVersion: options.protocol ?? 2, poisoned: false },
          content: {
            format: 'hwp5',
            strictMeasuredSaveAvailable: options.capability !== false,
            paragraphs: [{ section: 0, paragraph: 0, text: '한글A', editable: true }],
          },
        };
      },
      dispose() {
        closes++;
      },
    }),
    { createDocumentBytes: async () => new Uint8Array([1]) },
  );
  const editor = createEditor({ runtimeFactory: factory });
  await editor.createDocument({ format: 'hwp5' });
  await editor.requestExperimental(
    { kind: 'own-test-edit' },
    { mutation: true, token: editor.getEditorState().token },
  );
  assert.equal(editor.getEditorState().status, 'ready');
  assert.notEqual(
    editor.getEditorState().operationRevision,
    editor.getEditorState().savedOperationRevision,
  );
  const bridge = strictLayoutSaveBridge(editor);
  return {
    editor,
    bridge,
    messages,
    set beforeCommit(fn: () => void | Promise<void>) {
      beforeCommit = fn;
    },
    malformed() {
      malformed = true;
    },
    cleanupFails() {
      cleanupError = true;
    },
    get closes() {
      return closes;
    },
  };
}
function realm() {
  const oldDoc = globalThis.document,
    oldFace = globalThis.FontFace;
  class Face {
    family = 'OwnFont';
    status = 'loaded';
    style = 'normal';
    weight = '400';
    stretch = 'normal';
    unicodeRange = 'U+0-10FFFF';
    featureSettings = 'normal';
    variationSettings = 'normal';
  }
  const fonts: any = new Set([new Face()]);
  fonts.status = 'loaded';
  fonts.ready = Promise.resolve();
  fonts.check = () => true;
  const events = new Map();
  fonts.addEventListener = (name: string, fn: any) => events.set(name, fn);
  fonts.removeEventListener = (name: string) => events.delete(name);
  const doc: any = {
    fonts,
    createElement: () => ({
      getContext: () => ({
        font: '',
        fontKerning: 'none',
        measureText: (text: string) => ({
          width: text.length * 4,
          fontBoundingBoxAscent: 10,
          fontBoundingBoxDescent: 2,
        }),
      }),
    }),
  };
  Object.assign(globalThis, { document: doc, FontFace: Face });
  return {
    fonts,
    events,
    close() {
      if (oldDoc === undefined) delete (globalThis as any).document;
      else globalThis.document = oldDoc;
      if (oldFace === undefined) delete (globalThis as any).FontFace;
      else globalThis.FontFace = oldFace;
    },
  };
}
test('only an owned editor has the typed bridge; old capability/history remain unavailable', async () => {
  assert.throws(() => strictLayoutSaveBridge({}), /Unavailable/);
  for (const options of [{ capability: false }, { protocol: 1 }]) {
    const f = await setup(options);
    try {
      assert.equal(f.bridge.available(), false);
      await assert.rejects(f.bridge.prepare({ allowUnprotectedOutput: false }), /Unavailable/);
    } finally {
      await f.editor.dispose();
    }
  }
});
test('default save stays safe and raw experimental strict kinds cannot bypass typed admission', async () => {
  const f = await setup();
  try {
    await assert.rejects(f.editor.save(), /LayoutReflowRequired/);
    const request = f.messages.find((m) => m.kind === 'save');
    assert.equal(request.allowStaleLayout, false);
    for (const kind of ['strict-layout-prepare', 'strict-layout-commit', 'strict-layout-cancel'])
      assert.throws(
        () =>
          f.editor.requestExperimental(
            { kind },
            { mutation: true, token: f.editor.getEditorState().token },
          ),
        /UseTypedEditorOperation/,
      );
    assert.equal(f.messages.filter((m) => m.kind.startsWith('strict-')).length, 0);
  } finally {
    await f.editor.dispose();
  }
});
test('typed commit validates reply but saved marker changes only after synchronous publication', async () => {
  const f = await setup();
  try {
    const before = f.editor.getEditorState();
    const lease = await f.bridge.prepare({ allowUnprotectedOutput: false });
    const result = await f.bridge.commit(lease, [{ own: 'typed' }]);
    assert.equal(f.editor.getEditorState(), before);
    await f.bridge.cancel(lease);
    assert.throws(
      () =>
        f.bridge.publish(lease, result, () => {
          throw Error('download-failed');
        }),
      /download-failed/,
    );
    assert.equal(f.editor.getEditorState(), before);
    f.bridge.finish(lease);
    assert.equal(f.bridge.available(), true);
  } finally {
    await f.editor.dispose();
  }
});
test('mismatched prepare cleans its request and retains first error when cleanup fails', async () => {
  const f = await setup();
  f.malformed();
  f.cleanupFails();
  try {
    await assert.rejects(
      f.bridge.prepare({ allowUnprotectedOutput: false }),
      /MismatchedRuntimeReply/,
    );
    assert.ok(
      f.messages.some(
        (m) => m.kind === 'strict-layout-cancel' && m.prepareRequestId === 'strict-core-1',
      ),
    );
    assert.equal(f.bridge.available(), true);
  } finally {
    await f.editor.dispose();
  }
});
test('Window producer uses same runtime and publishes measured bytes after cleanup', async () => {
  const f = await setup(),
    r = realm(),
    saver = createMeasuredPlainLayoutSaver(f.editor);
  try {
    const before = f.editor.getEditorState();
    let published = 0;
    const result = await saver.save({
      publish(saved) {
        assert.equal(f.editor.getEditorState(), before);
        assert.equal(r.events.size, 0);
        assert.equal(saved.layoutRequiresReflow, false);
        published++;
      },
    });
    assert.equal(published, 1);
    assert.deepEqual(result.bytes, new Uint8Array([7, 9]));
    assert.notEqual(f.editor.getEditorState(), before);
    assert.equal(f.messages.filter((m) => m.kind === 'load').length, 1);
    assert.equal(f.messages.filter((m) => m.kind === 'strict-layout-commit').length, 1);
    assert.equal(
      f.messages.find((m) => m.kind === 'strict-layout-commit').allowUnprotectedOutput,
      false,
    );
    assert.equal(
      'allowStaleLayout' in f.messages.find((m) => m.kind === 'strict-layout-commit'),
      false,
    );
  } finally {
    saver.dispose();
    r.close();
    await f.editor.dispose();
  }
});
test('font mutation during commit publishes nothing and preserves saved marker/state', async () => {
  const f = await setup(),
    r = realm(),
    saver = createMeasuredPlainLayoutSaver(f.editor);
  f.beforeCommit = () => {
    r.fonts.add({});
  };
  const before = f.editor.getEditorState();
  try {
    await assert.rejects(
      saver.save({
        publish() {
          assert.fail('no publication');
        },
      }),
      /FontEnvironmentChanged/,
    );
    assert.equal(f.editor.getEditorState(), before);
    assert.equal(r.events.size, 0);
    assert.equal(saver.available(), true);
  } finally {
    saver.dispose();
    r.close();
    await f.editor.dispose();
  }
});
test('abort/dispose/late commit never publish or mark a replacement editor saved', async () => {
  for (const action of ['abort', 'dispose', 'replace'] as const) {
    const f = await setup(),
      r = realm(),
      saver = createMeasuredPlainLayoutSaver(f.editor),
      abort = new AbortController();
    f.beforeCommit = () => {
      if (action === 'abort') abort.abort();
      if (action === 'dispose') void f.editor.dispose();
      if (action === 'replace') void f.editor.createDocument({ format: 'hwp5' });
    };
    try {
      await assert.rejects(
        saver.save({
          signal: abort.signal,
          publish() {
            assert.fail('no publication');
          },
        }),
      );
    } finally {
      saver.dispose();
      r.close();
      await f.editor.dispose();
    }
  }
});
test('cleanup failure cannot replace original font-load failure; later save is unlocked', async () => {
  const f = await setup(),
    r = realm(),
    saver = createMeasuredPlainLayoutSaver(f.editor);
  f.cleanupFails();
  r.fonts.clear();
  try {
    await assert.rejects(
      saver.save({
        publish() {
          assert.fail('no publication');
        },
      }),
      /ChooseMatchingFontFile/,
    );
    assert.equal(saver.available(), true);
  } finally {
    saver.dispose();
    r.close();
    await f.editor.dispose();
  }
});

test('same editor has one pending lease across producers; cancellation never clears newer lease', async () => {
  const f = await setup();
  try {
    const a = await f.bridge.prepare({ allowUnprotectedOutput: false });
    await assert.rejects(f.bridge.prepare({ allowUnprotectedOutput: false }), /InProgress/);
    await f.bridge.cancel(a);
    f.bridge.finish(a);
    const b = await f.bridge.prepare({ allowUnprotectedOutput: false });
    await f.bridge.cancel(a);
    f.bridge.finish(a);
    assert.equal(f.bridge.available(), false);
    await f.bridge.cancel(b);
    f.bridge.finish(b);
    assert.equal(f.bridge.available(), true);
  } finally {
    await f.editor.dispose();
  }
});
test('input flush precedes prepare; an unsettled or detached surface prevents publication', async () => {
  const f = await setup();
  let settled = false,
    flushed = 0;
  const input = f.editor.acquireInputSurface({
    commitComposition() {
      flushed++;
      return 'unchanged';
    },
    cancelComposition() {},
    isOutputInputSettled: () => settled,
  });
  try {
    await assert.rejects(f.bridge.prepare({ allowUnprotectedOutput: false }), /Expired/);
    assert.equal(flushed, 1);
    assert.equal(f.bridge.available(), true);
    settled = true;
    const lease = await f.bridge.prepare({ allowUnprotectedOutput: false });
    input.release();
    await assert.rejects(f.bridge.commit(lease, [{}]), /Expired/);
    await f.bridge.cancel(lease);
    f.bridge.finish(lease);
  } finally {
    input.release();
    await f.editor.dispose();
  }
});
test('publication refuses async callbacks and keeps dirty marker unchanged', async () => {
  const f = await setup();
  try {
    const before = f.editor.getEditorState();
    const lease = await f.bridge.prepare({ allowUnprotectedOutput: false });
    const result = await f.bridge.commit(lease, [{}]);
    await f.bridge.cancel(lease);
    assert.throws(() => f.bridge.publish(lease, result, async () => {}), /Synchronous/);
    assert.equal(f.editor.getEditorState(), before);
    f.bridge.finish(lease);
  } finally {
    await f.editor.dispose();
  }
});
