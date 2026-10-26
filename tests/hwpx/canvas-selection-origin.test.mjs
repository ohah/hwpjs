import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
function fixture(callback) {
  const doc = { activeElement: null },
    row = {
      section: 0,
      paragraph: 0,
      text: 'AB',
      editable: true,
      selectionOwner: 'section:0:body',
    },
    layout = layoutContent({ format: 'hwpx', paragraphs: [row] }, 500, () => 10);
  class Node extends EventTarget {
    ownerDocument = doc;
    style = {};
    dataset = {};
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = 'forward';
    clientHeight = 10000;
    clientWidth = 500;
    scrollTop = 0;
    setAttribute() {}
    setSelectionRange(a, b, d = 'forward') {
      this.selectionStart = a;
      this.selectionEnd = b;
      this.selectionDirection = d;
    }
    focus() {
      doc.activeElement = this;
      this.dispatchEvent(new Event('focus'));
    }
    blur() {
      doc.activeElement = null;
      this.dispatchEvent(new Event('blur'));
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, bottom: 10000 };
    }
    hasPointerCapture() {
      return false;
    }
    setPointerCapture() {}
    scrollIntoView() {}
  }
  const canvas = new Node(),
    input = new Node(),
    viewport = new Node();
  let geometry;
  const renderer = {
    layout: () => layout,
    paragraph: () => row,
    onGeometry(fn) {
      geometry = fn;
    },
    select() {},
    preview() {},
    viewScale: () => 1,
  };
  const editor = createCanvasEditor({
    canvas,
    input,
    viewport,
    renderer,
    controls: { ready: () => true, busy: () => false, request: () => true },
    note: { textContent: '' },
    platform: 'test',
    environment: { ownerDocument: doc, AbortController },
    onCommittedSelection: callback,
  });
  return { editor, input, geometry: () => geometry?.() };
}
test('core reset provenance survives delayed blur/geometry paint; default reset is user owned', () => {
  const seen = [],
    f = fixture((value, meta) => seen.push({ value, origin: meta.origin }));
  try {
    f.editor.external({ kind: 'external-update', origin: 'core' });
    assert.equal(seen.at(-1).origin, 'core');
    f.input.blur();
    assert.equal(seen.at(-1).origin, 'core');
    const count = seen.length;
    f.geometry();
    assert.equal(seen.length, count);
    f.editor.reset();
    assert.equal(seen.at(-1).origin, 'canvas');
  } finally {
    f.editor.close();
  }
});
test('core range projection stays core, normal range selection becomes user owned', () => {
  const seen = [],
    f = fixture((value, meta) => seen.push({ value, origin: meta.origin }));
  try {
    assert.equal(
      f.editor.selectTextRange(
        { section: 0, paragraph: 0, startUnit: 0, endUnit: 1 },
        { focusInput: false, selectionOrigin: 'core' },
      ),
      true,
    );
    assert.equal(seen.at(-1).origin, 'core');
    f.input.blur();
    assert.equal(seen.at(-1).origin, 'core');
    assert.equal(
      f.editor.selectTextRange(
        { section: 0, paragraph: 0, startUnit: 0, endUnit: 0 },
        { focusInput: false },
      ),
      true,
    );
    assert.equal(seen.at(-1).origin, 'canvas');
  } finally {
    f.editor.close();
  }
});
test('existing one-argument committed selection callback remains compatible', () => {
  const seen = [],
    f = fixture((value) => seen.push(value));
  try {
    f.editor.reset();
    assert.equal(seen.at(-1), null);
  } finally {
    f.editor.close();
  }
});
