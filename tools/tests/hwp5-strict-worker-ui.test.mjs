// Synthetic Native transport/realm only; no actual browser or WASM evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { registerStrictLayoutTransport } from '../../js/hwp5-strict-layout-transport.mjs';
import { createStrictLayoutWorker } from '../../web/preview/strict-layout-worker.mjs';
import { createStrictLayoutSaveControls } from '../../web/preview/strict-layout-save-controls.mjs';
import { createBrowserStrictLayoutSaver } from '../../js/hwp5-browser-strict-layout.mjs';
const snapshot = () => ({
  schema: 1,
  version: 0x05000300,
  width: 10000,
  height: 10000,
  paragraphs: [
    {
      raw: [65, 13],
      font: 'OwnFont',
      size: 1000,
      bold: false,
      italic: false,
      spacing_percent: 160,
    },
  ],
});
function native() {
  const calls = { prepare: 0, commit: 0, cancel: 0 };
  const editor = { historyStats: () => ({ protocolVersion: 2 }) };
  const hooks = {
    supported: () => true,
    prepare() {
      calls.prepare++;
      return snapshot();
    },
    commit() {
      calls.commit++;
      return { bytes: new Uint8Array([1, 2]), layoutRequiresReflow: false };
    },
    cancel() {
      calls.cancel++;
    },
  };
  registerStrictLayoutTransport(editor, hooks);
  const state = { editor, format: 'hwp5', historyEnabled: true, poisoned: false };
  const worker = createStrictLayoutWorker({
    current: () => state,
    consent(value) {
      if (value !== true) throw Error('ConsentRequired');
    },
  });
  return { calls, hooks, state, worker };
}
const prepare = (w, id = 'p1') =>
  w.handle({ kind: 'strict-layout-prepare', requestId: id, allowUnprotectedOutput: true });
const commit = (w, ticket) =>
  w.handle({
    kind: 'strict-layout-commit',
    requestId: 'c1',
    ticket,
    lines: [{}],
    allowUnprotectedOutput: true,
  });
test('worker requires explicit ready History/format/ABI and consent', () => {
  for (const change of [
    (s) => (s.historyEnabled = false),
    (s) => (s.format = 'hwpx'),
    (s) => (s.poisoned = true),
    (s) => (s.editor = {}),
  ]) {
    const n = native();
    change(n.state);
    assert.throws(() => prepare(n.worker), /Unavailable/);
    assert.equal(n.calls.prepare, 0);
  }
  const n = native();
  assert.throws(() => n.worker.handle({ kind: 'strict-layout-prepare' }), /ConsentRequired/);
  assert.equal(n.calls.prepare, 0);
});
test('worker exact token binds one Native snapshot and commit consumes it', () => {
  const n = native();
  const a = prepare(n.worker);
  assert.throws(() => commit(n.worker, 'wrong'), /Expired/);
  const saved = commit(n.worker, a.ticket);
  assert.equal(saved.layoutRequiresReflow, false);
  assert.throws(() => commit(n.worker, a.ticket), /Expired/);
  assert.equal(n.calls.commit, 1);
});
test('worker old commit or cancel cannot consume newer prepared snapshot', () => {
  const n = native();
  const a = prepare(n.worker, 'a');
  n.worker.reset();
  const b = prepare(n.worker, 'b');
  n.worker.handle({ kind: 'strict-layout-cancel', ticket: a.ticket, prepareRequestId: 'a' });
  assert.throws(() => commit(n.worker, a.ticket), /Expired/);
  commit(n.worker, b.ticket);
  assert.equal(n.calls.commit, 1);
});
test('worker cancellation by prepare request id handles late prepare reply', () => {
  const n = native();
  prepare(n.worker, 'late');
  n.worker.handle({ kind: 'strict-layout-cancel', prepareRequestId: 'other' });
  assert.throws(() => prepare(n.worker, 'new'), /InProgress/);
  n.worker.handle({ kind: 'strict-layout-cancel', prepareRequestId: 'late' });
  prepare(n.worker, 'new');
  assert.equal(n.calls.prepare, 2);
});
test('worker rejects replaced editor and invalid/empty line packet', () => {
  const n = native();
  const a = prepare(n.worker);
  n.state.editor = {};
  assert.throws(() => commit(n.worker, a.ticket), /Unavailable/);
  n.state.editor = undefined;
  n.worker.reset();
  const x = native();
  const b = prepare(x.worker);
  assert.throws(
    () =>
      x.worker.handle({
        kind: 'strict-layout-commit',
        ticket: b.ticket,
        lines: [],
        allowUnprotectedOutput: true,
      }),
    /InvalidStrictLayoutLines/,
  );
  assert.equal(x.calls.commit, 0);
  assert.equal(x.calls.cancel, 1);
});
function realm() {
  class Face {
    constructor(family = 'OwnFont', _bytes, options = {}) {
      this.family = family;
      this.style = options.style ?? 'normal';
      this.weight = options.weight ?? '400';
    }
    status = 'loaded';
    stretch = 'normal';
    unicodeRange = 'U+0-10FFFF';
    featureSettings = 'normal';
    variationSettings = 'normal';
    async load() {
      return this;
    }
  }
  const face = new Face(),
    fonts = new Set([face]),
    events = new Map();
  fonts.status = 'loaded';
  fonts.ready = Promise.resolve();
  fonts.addEventListener = (k, fn) => events.set(k, fn);
  fonts.removeEventListener = (k, fn) => {
    if (events.get(k) === fn) events.delete(k);
  };
  fonts.check = () => true;
  const ctx = {
    font: '',
    fontKerning: 'none',
    measureText: (t) => ({
      width: t.length * 4,
      fontBoundingBoxAscent: 10,
      fontBoundingBoxDescent: 2,
    }),
  };
  return {
    Face,
    face,
    fonts,
    events,
    doc: { fonts, createElement: () => ({ getContext: () => ctx }) },
  };
}
function setup() {
  const r = realm(),
    oldDoc = globalThis.document,
    oldFace = globalThis.FontFace;
  globalThis.document = r.doc;
  globalThis.FontFace = r.Face;
  const n = native();
  class Node extends EventTarget {
    disabled = false;
    dataset = {};
    value = '';
    files = [];
    textContent = '';
  }
  const button = new Node(),
    input = new Node(),
    note = new Node(),
    sent = [],
    published = [];
  let controls,
    normalReady = true;
  const context = {
    worker: {
      postMessage(message) {
        sent.push(message);
        queueMicrotask(() => {
          try {
            const reply = n.worker.handle(message);
            controls.message({ origin: message.origin, ...reply });
          } catch (error) {
            controls.message({
              kind: message.kind,
              origin: message.origin,
              requestId: message.requestId,
              error: error.message,
            });
          }
        });
      },
    },
    generation: 1,
    format: 'hwp5',
    name: 'own.hwp',
  };
  const browser = {
    document: r.doc,
    FontFace: r.Face,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
  };
  controls = createStrictLayoutSaveControls({
    button,
    fontInput: input,
    note,
    current: () => context,
    canRequest: () => normalReady,
    consent: () => true,
    publish: (result, name) => published.push({ result, name }),
    browser,
  });
  const enable = () => controls.message({ content: { strictMeasuredSaveAvailable: true } });
  const close = () => {
    controls.close();
    if (oldDoc === undefined) delete globalThis.document;
    else globalThis.document = oldDoc;
    if (oldFace === undefined) delete globalThis.FontFace;
    else globalThis.FontFace = oldFace;
  };
  return {
    ...r,
    ...n,
    button,
    input,
    note,
    sent,
    published,
    context,
    controls,
    enable,
    close,
    setReady(v) {
      normalReady = v;
    },
  };
}
test('UI never auto prepares/loads/saves; old engine capability keeps explicit button off', async () => {
  const s = setup();
  try {
    assert.equal(s.sent.length, 0);
    assert.equal(await s.controls.request(), false);
    assert.equal(s.calls.prepare, 0);
    s.input.dispatchEvent(new Event('change'));
    assert.equal(s.calls.prepare, 0);
  } finally {
    s.close();
  }
});
test('UI bridge protocol publishes only strict bytes after commit and cleanup', async () => {
  const s = setup();
  try {
    s.enable();
    assert.equal(await s.controls.request(), true);
    assert.equal(s.published.length, 1);
    assert.equal(s.published[0].result.layoutRequiresReflow, false);
    assert.equal(s.button.dataset.state, 'saved');
    assert.equal(s.calls.commit, 1);
    assert.equal(s.events.size, 0);
  } finally {
    s.close();
  }
});
test('UI interleaved ordinary request expires pending save and never publishes late result', async () => {
  const s = setup();
  try {
    s.enable();
    const pending = s.controls.request();
    s.controls.beforeSend({ kind: 'splice' });
    assert.equal(await pending, false);
    await new Promise(queueMicrotask);
    assert.equal(s.published.length, 0);
    prepare(s.worker, 'after-reset');
  } finally {
    s.close();
  }
});
test('UI generation replacement while awaiting prepare cannot publish to newer document', async () => {
  const s = setup();
  try {
    s.enable();
    const pending = s.controls.request();
    s.context.generation++;
    s.controls.reset();
    assert.equal(await pending, false);
    assert.equal(s.published.length, 0);
  } finally {
    s.close();
  }
});
test('UI font mutation during asynchronous Worker commit discards derived bytes', async () => {
  const s = setup();
  try {
    s.enable();
    s.hooks.commit = () => {
      s.fonts.add(new s.Face('other'));
      return { bytes: new Uint8Array([1]), layoutRequiresReflow: false };
    };
    assert.equal(await s.controls.request(), false);
    assert.equal(s.published.length, 0);
    assert.match(s.note.textContent, /FontEnvironmentChanged/);
  } finally {
    s.close();
  }
});
test('UI font mutation during asynchronous cleanup is checked before publication', async () => {
  const s = setup();
  try {
    s.enable();
    const post = s.context.worker.postMessage.bind(s.context.worker);
    s.context.worker.postMessage = (message) => {
      if (message.kind === 'strict-layout-cancel' && message.requestId)
        s.fonts.add(new s.Face('other'));
      post(message);
    };
    assert.equal(await s.controls.request(), false);
    assert.equal(s.published.length, 0);
  } finally {
    s.close();
  }
});
test('producer preserves original error if cleanup also rejects and releases watch', async () => {
  const s = setup();
  try {
    const save = createBrowserStrictLayoutSaver({
      prepare: snapshot,
      check() {},
      async commit() {
        throw Error('OriginalNativeError');
      },
      async cancel() {
        throw Error('SecondaryCleanupError');
      },
    });
    await assert.rejects(save({ fontFace: s.face }), /OriginalNativeError/);
    assert.equal(s.events.size, 0);
  } finally {
    s.close();
  }
});
test('UI missing loaded matching font fails explicitly without stale fallback', async () => {
  const s = setup();
  try {
    s.enable();
    s.fonts.clear();
    assert.equal(await s.controls.request(), false);
    assert.equal(s.calls.commit, 0);
    assert.equal(s.published.length, 0);
  } finally {
    s.close();
  }
});
test('UI explicit file loads owned FontFace and reset removes only its face', async () => {
  const s = setup();
  try {
    s.enable();
    s.fonts.clear();
    const unrelated = new s.Face('unrelated');
    s.fonts.add(unrelated);
    s.input.files = [{ size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }];
    assert.equal(await s.controls.request(), true);
    assert.equal(s.fonts.size, 2);
    s.controls.reset();
    assert.equal(s.fonts.size, 1);
    assert.ok(s.fonts.has(unrelated));
  } finally {
    s.close();
  }
});
test('UI font file completion after document replacement cannot register or publish', async () => {
  const s = setup();
  try {
    s.enable();
    s.fonts.clear();
    let resolve,
      started = false;
    s.input.files = [
      {
        size: 4,
        arrayBuffer: () => {
          started = true;
          return new Promise((r) => {
            resolve = r;
          });
        },
      },
    ];
    const request = s.controls.request();
    await new Promise(setImmediate);
    assert.ok(started);
    s.context.generation++;
    s.controls.reset();
    resolve(new Uint8Array([1, 2, 3, 4]).buffer);
    assert.equal(await request, false);
    assert.equal(s.fonts.size, 0);
    assert.equal(s.published.length, 0);
  } finally {
    s.close();
  }
});
test('capability inspection never makes old ABI or unavailable History break ordinary content', () => {
  const n = native();
  n.hooks.supported = () => false;
  n.state.editor.historyStats = () => {
    throw Error('OldHistoryAbi');
  };
  assert.equal(n.worker.available(), false);
  assert.equal(n.calls.prepare, 0);
  n.hooks.supported = () => true;
  assert.equal(n.worker.available(), false);
  assert.equal(n.calls.prepare, 0);
});
test('producer publishes synchronously after final guarded cleanup before caller continuation', async () => {
  const s = setup();
  try {
    const steps = [];
    const save = createBrowserStrictLayoutSaver({
      prepare: snapshot,
      check() {},
      async commit() {
        steps.push('commit');
        return { bytes: new Uint8Array([1]), layoutRequiresReflow: false };
      },
      async cancel() {
        steps.push('cleanup');
      },
      publish() {
        assert.equal(s.events.size, 0);
        steps.push('publish');
      },
    });
    await save({ fontFace: s.face });
    steps.push('caller');
    assert.deepEqual(steps, ['commit', 'cleanup', 'publish', 'caller']);
  } finally {
    s.close();
  }
});
test('font cleanup removes the owned face from its original registration set', async () => {
  const s = setup();
  try {
    s.enable();
    s.fonts.clear();
    s.input.files = [{ size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }];
    assert.equal(await s.controls.request(), true);
    assert.equal(s.fonts.size, 1);
    s.doc.fonts = new Set();
    s.controls.reset();
    assert.equal(s.fonts.size, 0);
    assert.equal(s.doc.fonts.size, 0);
  } finally {
    s.close();
  }
});
