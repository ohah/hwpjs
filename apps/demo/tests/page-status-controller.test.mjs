// Actual controller and shell; fake Core/runtime/DOM, no browser or Native claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Document, all } from './fake-dom.mjs';
import { EditorState } from '../../../packages/core/dist/index.js';
const coreURL = new URL('../../../packages/core/dist/index.js', import.meta.url).href;
const coreStub =
  'data:text/javascript,' +
  encodeURIComponent(`export * from ${JSON.stringify(coreURL)};
export function createEditor(){ return globalThis[Symbol.for('page-status-test-editor')]; }`);
const runtimeStub =
  'data:text/javascript,' +
  encodeURIComponent(`
export function createWorkerRuntimeFactory(){const f=()=>{throw Error('UnexpectedRuntime')}; f.preload=async()=>{};return f;}
export function createReaderRuntimeFactory(){return {createDocumentBytes(){throw Error('UnexpectedNative')}};}`);
const cssRoot = new URL('../src/', import.meta.url).href;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@hwpjs/core' || specifier === '@hwpjs/core/runtime')
      return { url: specifier.endsWith('/runtime') ? runtimeStub : coreStub, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(cssRoot) && url.endsWith('.css'))
      return { format: 'module', source: 'export {};', shortCircuit: true };
    return next(url, context);
  },
});
const { mountDemo } = await import('../src/demo-controller.ts');
hook.deregister();
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('controller renders Surface page events without Core events, clears on loading/reset and unsubscribes', async () => {
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
    return node;
  };
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  doc.defaultView = Object.assign(new EventTarget(), {
    navigator: { platform: 'Linux' },
    innerWidth: 800,
    innerHeight: 600,
  });
  const root = doc.createElement('main'),
    listeners = new Set();
  let state = { status: 'idle', documentId: null },
    statusListener,
    released = 0;
  let page = { current: 1, total: 4, partial: false };
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    cancelLoad: async () => {},
    dispose: async () => {},
    dispatchCommand: async () => ({ status: 'applied' }),
  };
  globalThis[Symbol.for('page-status-test-editor')] = editor;
  const host = {
    getPageStatus: () => page,
    subscribePageStatus(fn) {
      statusListener = fn;
      return () => {
        statusListener = undefined;
        released++;
      };
    },
    setScale: () => true,
    dispose() {},
  };
  const demo = await mountDemo(root, 'vanilla', () => host, { fetch: async () => ({ ok: false }) });
  const label = () => all(root, (n) => n.getAttribute?.('aria-label') === '문서 쪽')[0].textContent;
  const publish = async (patch) => {
    state = new EditorState({
      editorId: 'page-status',
      documentId: 'doc',
      generation: 1,
      operationRevision: 0,
      viewRevision: 0,
      stateVersion: 1,
      status: 'ready',
      selection: null,
      content: { format: 'hwpx', paragraphs: [], limited: false },
      ...patch,
    });
    for (const fn of listeners) fn(state);
    await tick();
  };
  try {
    assert.equal(label(), '쪽 정보 없음');
    await publish({});
    assert.equal(label(), '미리보기 1 / 4쪽');
    page = { ...page, current: 2 };
    statusListener();
    await tick();
    assert.equal(label(), '미리보기 2 / 4쪽');
    await publish({ status: 'loading' });
    assert.equal(label(), '쪽 정보 없음');
    statusListener();
    await tick();
    assert.equal(label(), '쪽 정보 없음');
    page = null;
    await publish({ documentId: 'new' });
    assert.equal(label(), '쪽 정보 없음');
    page = { current: 1, total: 1, partial: false };
    statusListener();
    await tick();
    assert.equal(label(), '미리보기 1 / 1쪽');
  } finally {
    await demo.dispose();
    delete globalThis[Symbol.for('page-status-test-editor')];
  }
  assert.equal(released, 1);
  assert.equal(listeners.size, 0);
});
