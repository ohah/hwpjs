import test from "node:test";
import assert from "node:assert/strict";
import { createCanvasEditor } from "../../web/preview/canvas-editor.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";

test("Canvas range restoration preserves direction and optional toolbar focus", (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const doc = { activeElement: null };
  globalThis.document = doc;
  class Node extends EventTarget {
    style = {};
    dataset = {};
    value = "";
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = "forward";
    scrollTop = 0;
    clientHeight = 600;
    clientWidth = 500;
    setAttribute() {}
    scrollIntoView() {}
    hasPointerCapture() {
      return false;
    }
    setSelectionRange(start, end, direction = "forward") {
      this.selectionStart = start;
      this.selectionEnd = end;
      this.selectionDirection = direction;
    }
    focus() {
      doc.activeElement = this;
    }
    blur() {
      doc.activeElement = null;
    }
  }
  const canvas = new Node(),
    viewport = new Node(),
    input = new Node(),
    toolbar = {};
  const row = { section: 0, paragraph: 0, text: "A😀BCD", editable: true };
  const layout = layoutContent({ paragraphs: [row] }, 500, () => 10);
  const renderer = {
    layout: () => layout,
    paragraph: () => row,
    onGeometry() {},
    select() {},
    preview() {},
  };
  const controller = createCanvasEditor({
    canvas,
    viewport,
    input,
    renderer,
    note: { textContent: "" },
    controls: {
      ready: () => true,
      busy: () => false,
      request() {
        throw Error("UnexpectedMutation");
      },
    },
  });
  t.after(() => {
    try {
      controller.close();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
      else delete globalThis.document;
    }
  });
  doc.activeElement = toolbar;
  const target = { section: 0, paragraph: 0, startUnit: 1, endUnit: 4, affinity: "backward" };
  assert.equal(controller.selectTextRange(target, { focusInput: false }), true);
  assert.equal(doc.activeElement, toolbar);
  assert.equal(input.selectionDirection, "backward");
  assert.equal(input.selectionStart, 1);
  assert.equal(input.selectionEnd, 4);
  const before = [input.value, input.selectionStart, input.selectionEnd, input.selectionDirection];
  for (const invalid of [
    { affinity: "invalid" },
    { startUnit: 2 },
    { endUnit: 2 },
    { endUnit: 999 },
  ]) {
    assert.equal(controller.selectTextRange({ ...target, ...invalid }), false);
    assert.deepEqual(
      [input.value, input.selectionStart, input.selectionEnd, input.selectionDirection],
      before,
    );
    assert.equal(doc.activeElement, toolbar);
  }
  assert.equal(controller.selectTextRange({ ...target, affinity: "forward" }), true);
  assert.equal(doc.activeElement, input);
  assert.equal(input.selectionDirection, "forward");
});
