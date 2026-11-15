import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../web/preview/renderer.mjs';
import { rowLeft, rowTop } from '../../web/preview/row-geometry.mjs';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import {
  createObjectSelection,
  bindObjectSelectionEvents,
} from '../../packages/vanilla/src/object-selection.ts';

// Actual renderer/direct-input implementations, simulated DOM and synthetic Native metadata.
// This is source integration evidence; no WASM or browser is loaded.
class Node {
  constructor(doc) {
    this.ownerDocument = doc;
    this.listeners = new Map();
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.disabled = false;
  }
  addEventListener(type, fn, options) {
    const capture = options === true || options?.capture === true;
    const rows = this.listeners.get(type) ?? [];
    rows.push({ fn, capture });
    this.listeners.set(type, rows);
    options?.signal?.addEventListener('abort', () => this.removeEventListener(type, fn, options), {
      once: true,
    });
  }
  removeEventListener(type, fn, options) {
    const capture = options === true || options?.capture === true;
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((r) => r.fn !== fn || r.capture !== capture),
    );
  }
  fire(type, event, capture) {
    for (const r of (this.listeners.get(type) ?? []).slice())
      if (r.capture === capture && !event.stopped) r.fn(event);
  }
  setAttribute() {}
  removeAttribute() {}
  setSelectionRange(a, b, d = 'forward') {
    this.selectionStart = a;
    this.selectionEnd = b;
    this.selectionDirection = d;
  }
  getRootNode() {
    return this.ownerDocument;
  }
  focus() {
    this.ownerDocument.activeElement = this;
    this.ownerDocument.emit(this, 'focus');
  }
  blur() {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
    this.ownerDocument.emit(this, 'blur');
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, bottom: 600, width: 800, height: 600 };
  }
  setPointerCapture(id) {
    this.captured = id;
  }
  hasPointerCapture(id) {
    return this.captured === id;
  }
  releasePointerCapture() {
    this.captured = null;
  }
  scrollIntoView() {}
}
test('actual direct-input old caret cannot receive P or beforeinput during owned object intent with textarea still focused', (t) => {
  const doc = new Node(null);
  doc.ownerDocument = doc;
  doc.activeElement = null;
  doc.emit = (node, type, extra = {}) => {
    const e = {
      type,
      target: node,
      isTrusted: true,
      isPrimary: true,
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
      key: 'p',
      code: 'KeyP',
      defaultPrevented: false,
      stopped: false,
      composedPath: () => [node, doc],
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
      getModifierState: () => false,
      ...extra,
    };
    doc.fire(type, e, true);
    node.fire(type, e, true);
    if (!e.stopped) node.fire(type, e, false);
    return e;
  };
  const canvas = new Node(doc),
    input = new Node(doc),
    viewport = Object.assign(new Node(doc), {
      clientWidth: 800,
      clientHeight: 600,
      scrollTop: 0,
      scrollLeft: 0,
    }),
    frames = [];
  const ctx = new Proxy(
    {
      measureText: (text) => ({
        width: text.length * 8,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      }),
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  canvas.getContext = () => ctx;
  const environment = {
    ownerDocument: doc,
    activeElement: () => doc.activeElement,
    AbortController,
    requestFrame: (f) => (frames.push(f), frames.length),
    cancelFrame() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    setInterval: () => 1,
    clearInterval() {},
  };
  const renderer = createRenderer(canvas, viewport, { style: {} }, () => {}, environment);
  const content = {
    paragraphs: [
      { section: 0, paragraph: 0, text: 'OLD', editable: true, selectable: true },
      { section: 0, paragraph: 1, text: '\ufffc' },
    ],
    chartTargets: [{ section: 0, wrapper: 17, paragraph: 1, anchorUnit: 0 }],
    oles: [
      {
        section: 0,
        chartWrapper: 17,
        paragraph: 1,
        anchorUnit: 0,
        state: 'located',
        representation: 'chart-alternative',
      },
    ],
    limited: false,
  };
  const token = {
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: 0,
      viewRevision: 0,
    },
    state = { token, stateVersion: 1, selection: { text: 'old' } },
    lease = {};
  let resolveCommit;
  const pending = new Promise((r) => (resolveCommit = r));
  const actor = createObjectSelection({
    capture: () => ({
      state,
      source: content,
      lease,
      frame: renderer.paintedFrame(),
      modalRevision: 0,
    }),
    hit: (_s, x) => (x > 500 ? { kind: 'chart', section: 0, wrapper: 17 } : null),
    hostFocused: () => doc.activeElement === canvas,
    commit: () => pending,
    onError: (e) => {
      throw e;
    },
  });
  const unbind = bindObjectSelectionEvents({
    canvas,
    input,
    viewport,
    document: doc,
    selection: actor,
    point: (e) => ({ x: e.clientX, y: e.clientY }),
  });
  const requests = [],
    direct = createCanvasEditor({
      canvas,
      viewport,
      input,
      renderer,
      controls: { ready: () => true, busy: () => false, request: (m) => (requests.push(m), true) },
      note: { textContent: '' },
      environment,
    });
  t.after(() => {
    resolveCommit(null);
    unbind();
    actor.dispose();
    direct.close();
    renderer.close();
  });
  renderer.show(content, { resourceDocument: 'd:1', resourceEpoch: 'd:1:0' });
  const paint = () => {
    let n = 0;
    while (frames.length) {
      assert(++n < 30);
      frames.shift()();
    }
  };
  paint();
  const row = renderer.layout().rows.find((r) => r.paragraph === 0 && r.kind === 'text');

  doc.emit(canvas, 'pointerdown', { clientX: rowLeft(row) + 1, clientY: rowTop(row, 0) + 1 });
  doc.emit(canvas, 'pointerup', { clientX: rowLeft(row) + 1, clientY: rowTop(row, 0) + 1 });
  paint();
  assert.equal(doc.activeElement, input);
  assert.equal(input.value, 'OLD');
  assert.equal(direct.historyRoute(), 'text');
  doc.emit(canvas, 'pointerdown', { clientX: 600, clientY: 20 });
  assert.equal(doc.activeElement, input, 'the old body textarea really still owns focus');
  assert.equal(actor.current(), null);
  assert.equal(doc.emit(input, 'keydown').defaultPrevented, true);
  assert.equal(input.value, 'OLD');
  doc.emit(canvas, 'pointerup', { clientX: 600, clientY: 20 });
  assert.equal(doc.emit(input, 'keydown').defaultPrevented, true);
  assert.equal(
    doc.emit(input, 'beforeinput', { inputType: 'insertText', data: 'p' }).defaultPrevented,
    true,
  );
  assert.equal(input.value, 'OLD');
  assert.deepEqual(requests, []);
  assert.equal(actor.pendingInput(), false);
  assert.equal(
    doc.emit(input, 'keydown').defaultPrevented,
    false,
    'ordinary body P is not a default/global binding',
  );
});
