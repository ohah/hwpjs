import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentContextMenu } from '../../web/preview/document-context-menu.mjs';

// Event-path fixture, not a browser/OS IME model. Non-bubbling blur reaches ancestor capture only.
function fixture() {
  const document = { activeElement: null };
  class Element {
    get isConnected() {
      return document.body.contains(this) || document.head.contains(this);
    }
    nodeType = 1;
    children = [];
    listeners = [];
    attributes = {};
    dataset = {};
    style = {};
    hidden = false;
    disabled = false;
    parent = null;
    constructor(tag) {
      this.tag = tag;
    }
    addEventListener(type, callback, options = {}) {
      this.listeners.push({
        type,
        callback,
        capture: options === true || options.capture === true,
        signal: options.signal,
      });
    }
    append(...children) {
      for (const child of children) {
        child.remove();
        child.parent = this;
        this.children.push(child);
      }
    }
    replaceChildren(...children) {
      for (const child of this.children) child.remove();
      this.append(...children);
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    contains(node) {
      for (; node; node = node.parent) if (node === this) return true;
      return false;
    }
    closest() {
      return this.tag === 'button' ? this : null;
    }
    focus() {
      document.activeElement = this;
    }
    getBoundingClientRect() {
      return { left: 20, top: 30, width: 150, height: 100 };
    }
  }
  document.createElement = (tag) => new Element(tag);
  document.body = new Element('body');
  document.head = new Element('head');
  document.defaultView = Object.assign(new Element('window'), {
    innerWidth: 640,
    innerHeight: 480,
  });
  document.addEventListener = Element.prototype.addEventListener;
  document.listeners = [];
  const rootA = new Element('canvas-host'),
    rootB = new Element('canvas-host');
  const inputA = new Element('textarea'),
    inputB = new Element('textarea');
  rootA.append(inputA);
  rootB.append(inputB);
  document.body.append(rootA, rootB);
  inputA.focus();
  const calls = [],
    subscribers = new Set();
  let copyAllowed = true;
  const control = createDocumentContextMenu({
    document,
    targets: [rootA, rootB],
    commandIds: ['copy'],
    registry: {
      commands: () => [{ id: 'copy', label: '복사', enabled: copyAllowed }],
      execute: (id) => calls.push({ id, focus: document.activeElement }),
      subscribe: (fn) => {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
    },
  });
  const menu = document.body.children.find((child) => child.attributes.role === 'menu');
  function send(target, type, values = {}) {
    const event = {
      target,
      type,
      defaultPrevented: false,
      bubbles: type !== 'blur',
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      ...values,
    };
    const path = [];
    for (let node = target; node; node = node.parent) path.push(node);
    const invoke = (node, capture) => {
      for (const row of node.listeners)
        if (row.type === type && row.capture === capture && !row.signal?.aborted)
          row.callback(event);
    };
    for (const node of [...path].reverse()) {
      invoke(node, true);
      if (event.stopped) return event;
    }
    for (const node of event.bubbles ? path : [target]) {
      invoke(node, false);
      if (event.stopped) break;
    }
    return event;
  }
  return {
    document,
    inputA,
    inputB,
    rootA,
    rootB,
    menu,
    calls,
    subscribers,
    control,
    send,
    open: () => send(inputA, 'contextmenu', { button: 2, clientX: 40, clientY: 50 }),
    allowCopy(value) {
      copyAllowed = value;
      for (const update of subscribers) update();
    },
  };
}

test('delegated non-bubbling blur clears only the composing child', () => {
  const h = fixture();
  try {
    h.send(h.inputA, 'compositionstart');
    assert(!h.open().defaultPrevented);
    assert(h.menu.hidden);
    h.send(h.inputB, 'blur');
    h.open();
    assert(h.menu.hidden);
    h.send(h.inputA, 'blur');
    assert(h.open().defaultPrevented);
    assert(!h.menu.hidden);
  } finally {
    h.control.close();
  }
});

test('independent composition owners survive unrelated end and blur', () => {
  const h = fixture();
  try {
    h.send(h.inputA, 'compositionstart');
    h.send(h.inputB, 'compositionstart');
    h.send(h.inputA, 'compositionend');
    h.open();
    assert(h.menu.hidden);
    h.send(h.inputA, 'blur');
    h.open();
    assert(h.menu.hidden);
    h.send(h.inputB, 'compositionend');
    assert(h.open().defaultPrevented);
  } finally {
    h.control.close();
  }
});

test('composition Escape and keyboard invocation preserve focus without executing', () => {
  const h = fixture();
  try {
    h.open();
    h.inputA.focus();
    h.send(h.inputA, 'compositionstart');
    assert(h.menu.hidden);
    const escape = h.send(h.menu, 'keydown', { key: 'Escape' });
    assert(!escape.defaultPrevented);
    const key = h.send(h.inputA, 'keydown', { key: 'F10', shiftKey: true });
    assert(!key.defaultPrevented);
    assert.equal(h.document.activeElement, h.inputA);
    assert.deepEqual(h.calls, []);
    h.send(h.inputA, 'compositionend');
    assert(h.send(h.inputA, 'keydown', { key: 'F10', shiftKey: true }).defaultPrevented);
  } finally {
    h.control.close();
  }
});

test('dispose aborts delegated composition listeners and menu actions', () => {
  const h = fixture();
  h.send(h.inputA, 'compositionstart');
  h.control.close();
  h.send(h.inputA, 'compositionend');
  h.send(h.inputA, 'blur');
  assert(!h.open().defaultPrevented);
  assert.equal(h.subscribers.size, 0);
  assert.equal(h.document.head.children.length, 0);
  assert.deepEqual(h.calls, []);
  assert([...h.rootA.listeners, ...h.rootB.listeners].every((row) => row.signal.aborted));
});

test('readonly copy follows live permission and focus-restoration recheck', () => {
  const h = fixture();
  try {
    h.send(h.inputA, 'compositionstart');
    h.send(h.inputB, 'blur');
    h.open();
    assert(h.menu.hidden);
    h.send(h.inputA, 'compositionend');
    h.allowCopy(false);
    h.open();
    assert(h.menu.children[0].disabled);
    h.send(h.menu.children[0], 'click');
    assert.deepEqual(h.calls, []);
    h.allowCopy(true);
    h.inputA.focus = () => {
      h.document.activeElement = h.inputA;
      h.allowCopy(false);
    };
    h.send(h.menu.children[0], 'click');
    assert.deepEqual(h.calls, []);
    assert(h.menu.hidden);
    h.inputA.focus = () => {
      h.document.activeElement = h.inputA;
    };
    h.allowCopy(true);
    h.open();
    h.send(h.menu.children[0], 'click');
    assert.deepEqual(h.calls, [{ id: 'copy', focus: h.inputA }]);
  } finally {
    h.control.close();
  }
});

test('detached owner without end or blur cannot block remaining live targets', () => {
  const h = fixture();
  try {
    h.send(h.inputA, 'compositionstart');
    h.inputA.remove();
    const openB = () => h.send(h.inputB, 'contextmenu', { button: 2, clientX: 40, clientY: 50 });
    assert(openB().defaultPrevented);
    assert(!h.menu.hidden);
    h.send(h.inputB, 'compositionstart');
    assert(h.menu.hidden);
    assert(!openB().defaultPrevented);
    // Removing an unrelated old owner never releases the connected owner B.
    h.send(h.rootA, 'blur');
    assert(!openB().defaultPrevented);
    h.send(h.inputB, 'compositionend');
    assert(h.send(h.inputB, 'keydown', { key: 'F10', shiftKey: true }).defaultPrevented);
    assert.deepEqual(h.calls, []);
  } finally {
    h.control.close();
  }
});
test('unknown connectivity remains guarded instead of inventing detachment', () => {
  const h = fixture();
  try {
    Object.defineProperty(h.inputA, 'isConnected', { value: undefined });
    h.send(h.inputA, 'compositionstart');
    h.inputA.remove();
    const openB = () => h.send(h.inputB, 'contextmenu', { button: 2, clientX: 40, clientY: 50 });
    assert(!openB().defaultPrevented);
    assert(h.menu.hidden);
    h.send(h.rootA, 'compositionend', { target: h.inputA });
    assert(openB().defaultPrevented);
  } finally {
    h.control.close();
  }
});
