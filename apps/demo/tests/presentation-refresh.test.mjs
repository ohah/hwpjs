import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createPresentationRefresh } from '../src/presentation-refresh.ts';
import { fixture } from './caret-formatting-fixture.mjs';
import { Document, all } from './fake-dom.mjs';

test('presentation runs after later synchronous observers and reads their latest state', async () => {
  let state = 0,
    observed = 0;
  const shown = [];
  const refresh = createPresentationRefresh(() => shown.push({ state, observed }));
  const listeners = [
    () => refresh.request(),
    () => {
      observed = state;
    },
  ];
  state = 1;
  const pending = listeners.map((listener) => listener());
  assert.deepEqual(shown, []);
  await Promise.all(pending);
  assert.deepEqual(shown, [{ state: 1, observed: 1 }]);
});

test('bursts coalesce without retaining a state snapshot; separate turns still refresh', async () => {
  let state = 0;
  const shown = [];
  const refresh = createPresentationRefresh(() => shown.push(state));
  const first = refresh.request();
  state = 1;
  assert.equal(refresh.request(), undefined);
  state = 2;
  assert.equal(refresh.request(), undefined);
  await first;
  assert.deepEqual(shown, [2]);
  state = 3;
  await refresh.request();
  assert.deepEqual(shown, [2, 3]);
});

test('disposal cancels queued presentation and later requests', async () => {
  let calls = 0;
  const refresh = createPresentationRefresh(() => calls++);
  const pending = refresh.request();
  refresh.dispose();
  refresh.dispose();
  await pending;
  assert.equal(refresh.request(), undefined);
  await Promise.resolve();
  assert.equal(calls, 0);
});

test('a state change during presentation can schedule the next turn', async () => {
  let state = 1;
  const shown = [];
  let next;
  const refresh = createPresentationRefresh(() => {
    shown.push(state);
    if (state === 1) {
      state = 2;
      next = refresh.request();
    }
  });
  await refresh.request();
  await next;
  assert.deepEqual(shown, [1, 2]);
});

test('refresh errors reach the requesting observer promise and do not wedge pending', async () => {
  let fail = true,
    calls = 0;
  const refresh = createPresentationRefresh(() => {
    calls++;
    if (fail) throw Error('PresentationFailed');
  });
  const first = refresh.request();
  assert.equal(refresh.request(), undefined);
  await assert.rejects(first, /PresentationFailed/);
  fail = false;
  await refresh.request();
  assert.equal(calls, 2);
});

// Actual controller/shell/bridge and existing caret fixture; no Native or DOM layout.
// Runtime factory alone is replaced so controller cannot create Worker/Native.
const coreURL = import.meta.resolve('@hwpjs/core');
const coreStub =
  'data:text/javascript,' +
  encodeURIComponent(
    `export * from ${JSON.stringify(coreURL)}; export function createEditor(){ return globalThis[Symbol.for('presentation-review-editor')]; }`,
  );
const runtimeStub =
  'data:text/javascript,' +
  encodeURIComponent(
    'export function createWorkerRuntimeFactory(){ const factory=()=>{throw Error("UnexpectedNativeRuntime")}; factory.preload=async()=>{}; return factory; }',
  );
const sourceRoot = new URL('../src/', import.meta.url).href;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@hwpjs/core') return { url: coreStub, shortCircuit: true };
    if (specifier === '@hwpjs/core/runtime') return { url: runtimeStub, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(sourceRoot) && url.endsWith('.css'))
      return { format: 'module', source: 'export {};', shortCircuit: true };
    return next(url, context);
  },
});
let mountDemo;
try {
  ({ mountDemo } = await import('../src/demo-controller.ts'));
} finally {
  hook.deregister();
}

test('real controller refreshes caret availability after a Surface observer registered later', async () => {
  const f = await fixture();
  globalThis[Symbol.for('presentation-review-editor')] = f.core;
  const doc = new Document(),
    create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = create(tag),
      append = node.append.bind(node);
    node.append = (...children) =>
      append(
        ...children.map((child) => (typeof child === 'string' ? doc.createTextNode(child) : child)),
      );
    node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    if (tag === 'dialog') {
      node.showModal = () => {
        node.open = true;
      };
      node.close = () => {
        node.open = false;
      };
    }
    return node;
  };
  doc.querySelector = (selector) => {
    assert.equal(selector, 'dialog:modal');
    return null;
  };
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  doc.defaultView = Object.assign(new EventTarget(), {
    navigator: { platform: 'Linux' },
    innerWidth: 800,
    innerHeight: 600,
  });
  let observed = -1,
    deniedBeforeObserver = 0;
  const host = {
    captureCaretFormatting() {
      if (observed !== f.core.getEditorState().stateVersion) {
        deniedBeforeObserver++;
        return null;
      }
      return f.getHost().captureCaretFormatting();
    },
    setScale: () => true,
    dispose() {},
  };
  let demo,
    unsubscribe = () => {};
  try {
    const root = doc.createElement('main');
    demo = await mountDemo(root, 'react', async () => host, {
      fetch: async () => ({ ok: true, json: async () => [] }),
    });
    const size = all(
      root,
      (node) => node.tagName === 'INPUT' && node.dataset.command === 'set-font-size',
    )[0];
    assert.equal(size.disabled, true);
    assert.ok(deniedBeforeObserver > 0);
    unsubscribe = f.core.registerStateListener((state) => {
      observed = state.stateVersion;
    });
    const before = f.core.getEditorState().stateVersion;
    await f.select(0, 0);
    assert.ok(observed > before);
    assert.equal(
      size.disabled,
      false,
      'a later Surface observer must not leave shell on EmptyCharacterSelection',
    );
    assert.equal(size.value, '15');
    assert.equal(
      all(
        root,
        (node) => node.dataset.command === 'bold' && node.className === 'hwp-demo-format-tool',
      )[0].disabled,
      false,
    );
    assert.equal(f.requests.length, 0, 'presentation never requests typing or Native mutations');
    assert.equal(f.core.getEditorState().selection.startUnit, 0);
    assert.equal(f.core.getEditorState().selection.endUnit, 0);
  } finally {
    unsubscribe();
    await demo?.dispose();
    await f.dispose();
    delete globalThis[Symbol.for('presentation-review-editor')];
  }
});
