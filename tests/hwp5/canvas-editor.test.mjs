import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { createCanvasEditor } from "../../web/preview/canvas-editor.mjs";
import { displayContent } from "../../web/preview/content.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
import { caretGeometry } from "../../web/preview/text-geometry.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
function dispatch(node, type, values = {}) { const event = new Event(type, { cancelable: true }); Object.assign(event, values); node.dispatchEvent(event); return event; }
async function harness(t, name = "charshape", choose = p => p.editable && p.text.length > 0) {
  const bytes = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
  const native = await createExperimentalHwp5Editor(wasm, bytes), reader = await createHwp5Reader(wasm);
  let content;
  try { content = displayContent(reader.readText(bytes)); } finally { reader.close(); }
  const paragraph = content.paragraphs.find(choose); assert(paragraph);
  const documentBefore = globalThis.document, doc = { activeElement: null }; globalThis.document = doc;
  class Node extends EventTarget {
    style = {}; dataset = {}; value = ""; selectionStart = 0; selectionEnd = 0; selectionDirection = "forward"; attributes = new Map();
    setAttribute(key, value) { this.attributes.set(key, value); }
    setSelectionRange(start, end, direction = "forward") { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
    focus() { doc.activeElement = this; dispatch(this, "focus"); }
    scrollIntoView() {}
    blur() { doc.activeElement = null; dispatch(this, "blur"); }
    getBoundingClientRect() { return { top: 0, left: 0, bottom: 300 }; }
    setPointerCapture() {} hasPointerCapture() { return false; } releasePointerCapture() {}
  }
  const canvas = new Node(), input = new Node(), viewport = new Node(), note = { textContent: "" };
  viewport.scrollTop = 0; viewport.clientHeight = 300; viewport.clientWidth = 440;
  let layout, draft = null, busy = false;
  const reflow = () => { layout = layoutContent({ ...content, paragraphs: content.paragraphs.map(p => draft && p.section === draft.section && p.paragraph === draft.paragraph ? { ...p, text: draft.text } : p) }, 400, () => 10); };
  const renderer = { layout: () => layout, paragraph: point => content.paragraphs.find(p => p.section === point.section && p.paragraph === point.paragraph), preview(value) { draft = value; reflow(); }, select() {}, onGeometry() {} };
  const requests = [], queue = [];
  const controls = { ready: () => true, busy: () => busy, request(message) { if (busy) return false; busy = true; requests.push(message); queue.push(message); return true; } };
  const controller = createCanvasEditor({ canvas, input, viewport, renderer, controls, note }); controller.reset();
  t.after(() => { controller.close(); native.close(); if (documentBefore === undefined) delete globalThis.document; else globalThis.document = documentBefore; });
  const caret = caretGeometry(layout, { ...paragraph, unit: 0 }); assert(caret);
  dispatch(canvas, "pointerdown", { button: 0, pointerId: 1, clientX: caret.x, clientY: caret.y });
  dispatch(canvas, "pointerup", { pointerId: 1 });
  return {
    input, canvas, native, controller, note, requests, paragraph,
    type(text) { input.value = text; input.setSelectionRange(text.length, text.length); dispatch(input, "input"); },
    ack({ clipped = false } = {}) {
      const message = queue.shift(); assert(message);
      let response = { kind: message.kind, origin: message.origin };
      try {
        native.splice(message);
        content = { ...content, paragraphs: content.paragraphs.map(p => {
          if (p.section !== message.section || p.paragraph !== message.paragraph) return p;
          const text = native.text(p.section, p.paragraph).slice(0, -1);
          return { ...p, text: clipped ? text.slice(0, 2) : text, editable: !clipped };
        }) }; draft = null; reflow();
      } catch (error) { response.error = error.message; }
      busy = false; controller.message(response);
    },
  };
}

test("canvas input uses native text on five real fixtures and queues fast typing", async t => {
  for (const name of ["charshape", "parashape", "linespacing", "facename", "underline-styles"]) {
    await t.test(name, async t => {
      const h = await harness(t, name), before = h.input.value;
      h.type("한😀" + before); h.type("한😀x" + before);
      assert.equal(h.requests.length, 1); h.ack(); assert.equal(h.requests.length, 2); h.ack();
      assert.equal(h.native.text(h.paragraph.section, h.paragraph.paragraph), "한😀x" + before + "\r");
      assert.equal(h.input.value, "한😀x" + before);
    });
  }
});
test("composition commits once after final DOM value and never during intermediate input", async t => {
  const h = await harness(t), before = h.input.value;
  dispatch(h.input, "compositionstart"); h.type("가" + before); h.type("각" + before);
  assert.equal(h.requests.length, 0); assert.equal(h.canvas.dataset.composing, "true");
  dispatch(h.input, "compositionend"); dispatch(h.input, "input", { inputType: "insertFromComposition" });
  await Promise.resolve(); assert.equal(h.requests.length, 1); h.ack();
  assert.equal(h.native.text(0, 1), "각" + before + "\r");
  assert.equal(h.canvas.dataset.composing, "false");
});
test("canvas software application title edits its actual nested table paragraph", async t => {
  const h = await harness(t, "software", p => p.editable && p.text.includes("Software Wave"));
  assert.equal(h.paragraph.paragraph, 2); assert.match(h.paragraph.label, /중첩/);
  const before = h.input.value;
  h.type("한😀" + before); h.ack();
  assert.equal(h.input.value, "한😀" + before);
  assert.equal(h.native.text(0, 2), "한😀" + before + "\r");
  assert.equal(h.requests.length, 1); assert(!h.note.textContent.includes("실패"));
});
test("canvas input materializes an originally empty table cell and handles queued typing", async t => {
  const h = await harness(t, "table", p => p.paragraph === 1 && p.editable);
  assert.equal(h.input.value, ""); assert.match(h.paragraph.label, /빈 문단/);
  h.type("한"); h.type("한😀");
  assert.equal(h.requests.length, 1); h.ack(); h.ack();
  assert.equal(h.native.text(0, 1), "한😀\r");
  assert.equal(h.input.value, "한😀");
  h.type(""); h.ack(); assert.equal(h.native.text(0, 1), "\r");
  h.type("재입력"); h.ack(); assert.equal(h.input.value, "재입력");
});
test("native rejected newline rolls draft back without another queued edit", async t => {
  const h = await harness(t), before = h.input.value;
  h.type("bad\n" + before); h.type("bad\nqueued" + before); h.ack();
  assert.equal(h.native.text(0, 1), before + "\r"); assert.equal(h.input.value, before);
  assert.equal(h.requests.length, 1); assert(h.note.textContent.includes("UnsupportedTextControl"));
});
test("reset cancels composition and late completion cannot target a new file", async t => {
  const h = await harness(t);
  dispatch(h.input, "compositionstart"); h.type("가" + h.input.value); h.controller.reset();
  dispatch(h.input, "compositionend"); dispatch(h.input, "input"); await Promise.resolve();
  assert.equal(h.requests.length, 0); assert(h.input.disabled); assert.equal(h.canvas.dataset.caret, "");
});
test("clipped acknowledgement stops editing instead of treating partial text as native source", async t => {
  const h = await harness(t), before = h.input.value;
  h.type("first" + h.input.value); h.type("queued" + h.input.value); h.ack({ clipped: true });
  assert.equal(h.requests.length, 1); assert(h.input.disabled); assert(h.note.textContent.includes("표시 한도"));
  assert.equal(h.native.text(0, 1), "first" + before + "\r");
});
test("explicit Ctrl or Meta A selects the current paragraph, which can become empty and accept input again", async t => {
  const h = await harness(t);
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }]) {
    const event = dispatch(h.input, "keydown", { key: "a", ...modifiers });
    assert(event.defaultPrevented); assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, h.input.value.length);
  }
  h.type(""); h.ack(); assert.equal(h.native.text(0, 1), "\r");
  h.type("복원😀"); h.ack(); assert.equal(h.native.text(0, 1), "복원😀\r");
});
