import test from "node:test";
import assert from "node:assert/strict";
import { createCommandSearch } from "../../web/preview/command-search.mjs";

function harness() {
  const document = { activeElement: null, defaultView: new EventTarget() };
  class Node extends EventTarget {
    constructor(tag) { super(); this.tag = tag; }
    children = []; dataset = {}; value = ""; open = false;
    setAttribute() {}
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren() { for (const child of this.children) child.parent = null; this.children = []; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    contains(node) { while (node) { if (node === this) return true; node = node.parent; } return false; }
    closest() { return this.tag === "button" && this.dataset.commandId ? this : null; }
  }
  document.createElement = tag => new Node(tag);
  document.head = new Node("head"); document.body = new Node("body");
  const host = new Node("nav"), editor = new Node("textarea"); document.body.append(host, editor); editor.focus();
  const state = [{ id: "menu-save", label: "저장", enabled: false }, { id: "menu-undo", label: "실행 취소", enabled: true }];
  const calls = [], registry = { commands: () => state.map(c => ({ ...c })), execute(id) { if (!state.find(c => c.id === id)?.enabled) return false; calls.push(id); return true; } };
  const control = createCommandSearch({ registry, document, host });
  const dialog = document.body.children.find(n => n.id === "command-search");
  const input = dialog.children.find(n => n.id === "command-search-query"), list = dialog.children.find(n => n.id === "command-search-results");
  const send = (target, values, type = "keydown") => { const event = new Event(type, { cancelable: true }); Object.assign(event, values); target.dispatchEvent(event); return event; };
  return { document, host, editor, control, dialog, input, list, state, calls, send };
}

test("search opens with shortcut, filters current DOM value on Enter and delegates once", () => {
  const h = harness();
  const event = h.send(h.document.defaultView, { key: "P", ctrlKey: true, shiftKey: true });
  assert(event.defaultPrevented); assert(h.dialog.open); assert.equal(h.document.activeElement, h.input);
  assert.equal(h.list.children[0].disabled, true);
  h.input.value = "취소"; // No input event: submit must use the actual value.
  h.send(h.input, { key: "Enter" });
  assert.deepEqual(h.calls, ["menu-undo"]); assert.equal(h.dialog.open, false);
  assert.equal(h.document.activeElement, h.editor);
  h.control.close(); h.control.close(); assert.equal(h.host.children.length, 0); assert.equal(h.document.head.children.length, 0);
  h.send(h.document.defaultView, { key: "p", metaKey: true, shiftKey: true }); assert.equal(h.dialog.open, false);
});

test("late disabled command, unknown query, IME and Escape cannot execute a command", () => {
  const h = harness();
  for (const values of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { altKey: true }]) {
    const e = h.send(h.document.defaultView, { key: "p", ctrlKey: true, shiftKey: true, ...values });
    assert.equal(e.defaultPrevented, false); assert.equal(h.dialog.open, false);
  }
  h.control.open();
  const item = h.list.children[1]; h.state[1].enabled = false;
  const click = new Event("click"); Object.defineProperty(click, "target", { value: item }); h.list.dispatchEvent(click);
  assert(h.dialog.open); assert.deepEqual(h.calls, []);
  h.input.value = "unknown"; h.send(h.input, {}, "input"); assert.equal(h.list.children.length, 0);
  h.send(h.input, { key: "Enter" }); assert.deepEqual(h.calls, []);
  h.send(h.dialog, { key: "Escape" }); assert.equal(h.dialog.open, false); assert.equal(h.document.activeElement, h.editor);
  h.control.close();
});

test("arrow navigation skips disabled commands and returns to search", () => {
  const h = harness(); h.control.open();
  h.send(h.input, { key: "ArrowDown" }); assert.equal(h.document.activeElement, h.list.children[1]);
  h.send(h.list, { key: "ArrowUp" }); assert.equal(h.document.activeElement, h.input);
  h.control.close();
});
