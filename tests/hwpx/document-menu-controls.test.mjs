import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentMenuControls } from "../../web/preview/document-menu-controls.mjs";
test("menu reflects inherited fieldset disablement and rechecks before dispatch", () => {
  let inherited = true, requests = 0;
  const button = Object.assign(new EventTarget(), { disabled: false });
  const target = { disabled: false, matches: selector => selector === ":disabled" && inherited, click: () => requests++ };
  const controls = createDocumentMenuControls([{ button, target }]);
  assert.equal(button.disabled, true);
  button.dispatchEvent(new Event("click")); assert.equal(requests, 0);
  inherited = false; controls.refresh(); assert.equal(button.disabled, false);
  inherited = true; button.dispatchEvent(new Event("click"));
  assert.equal(requests, 0); assert.equal(button.disabled, true);
  inherited = false; controls.refresh(); button.dispatchEvent(new Event("click")); assert.equal(requests, 1);
  controls.close();
});
test("format menu reflects only explicit target pressed values and respects a late protection change", () => {
  const attributes = new Map();
  const button = Object.assign(new EventTarget(), { disabled: false,
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) });
  let pressed = "mixed", requests = 0;
  const target = { disabled: false, getAttribute: key => key === "aria-pressed" ? pressed : null,
    click: () => { requests++; pressed = "true"; } };
  const controls = createDocumentMenuControls([{ button, target }]);
  assert.equal(attributes.get("aria-pressed"), "mixed");
  button.dispatchEvent(new Event("click")); assert.equal(requests, 1);
  assert.equal(attributes.get("aria-pressed"), "true");
  pressed = "false"; controls.refresh(); assert.equal(attributes.get("aria-pressed"), "false");
  pressed = "unknown"; controls.refresh(); assert.equal(attributes.has("aria-pressed"), false);
  target.disabled = true; button.dispatchEvent(new Event("click")); assert.equal(requests, 1);
  assert.equal(button.disabled, true); controls.close();
});
test("view menu mirrors the existing disclosure authority without a second panel state", () => {
  const attributes = new Map();
  const button = Object.assign(new EventTarget(), { disabled: false,
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) });
  let expanded = "false", requests = 0;
  const target = { disabled: false, getAttribute: key => key === "aria-expanded" ? expanded : null,
    click: () => { requests++; expanded = expanded === "true" ? "false" : "true"; } };
  const controls = createDocumentMenuControls([{ button, target }]);
  assert.equal(attributes.get("aria-expanded"), "false");
  button.dispatchEvent(new Event("click")); assert.equal(requests, 1);
  assert.equal(attributes.get("aria-expanded"), "true");
  expanded = "false"; controls.refresh(); assert.equal(attributes.get("aria-expanded"), "false");
  expanded = "unknown"; controls.refresh(); assert.equal(attributes.has("aria-expanded"), false);
  controls.close();
});
test("menu delegates once and shares current target readiness", () => {
  let requests = 0;
  const popup = { open: true };
  const button = Object.assign(new EventTarget(), { disabled: false, closest: () => popup });
  const target = { disabled: true, click: () => { requests++; target.disabled = true; } };
  const controls = createDocumentMenuControls([{ button, target }]);
  assert.equal(button.disabled, true);
  button.dispatchEvent(new Event("click")); assert.equal(requests, 0);
  target.disabled = false; controls.refresh();
  button.dispatchEvent(new Event("click")); assert.equal(requests, 1);
  assert.equal(button.disabled, true); assert.equal(popup.open, false);
  button.dispatchEvent(new Event("click")); assert.equal(requests, 1);
  target.disabled = false; controls.refresh();
  target.disabled = true; button.dispatchEvent(new Event("click")); assert.equal(requests, 1);
  controls.close(); controls.close(); target.disabled = false; controls.refresh();
  button.dispatchEvent(new Event("click")); assert.equal(requests, 1); assert.equal(button.disabled, true);
});
test("opening a disclosure refreshes readiness and late toggle cannot revive a closed menu", () => {
  const popup = Object.assign(new EventTarget(), { open: false });
  const button = Object.assign(new EventTarget(), { disabled: false, closest: () => popup });
  let requests = 0;
  const target = { disabled: true, click: () => requests++ };
  const controls = createDocumentMenuControls([{ button, target }]);
  assert.equal(button.disabled, true);
  target.disabled = false; popup.open = true; popup.dispatchEvent(new Event("toggle"));
  assert.equal(button.disabled, false); assert.equal(requests, 0);
  target.disabled = true; popup.dispatchEvent(new Event("toggle"));
  assert.equal(button.disabled, true); assert.equal(requests, 0);
  controls.close(); target.disabled = false; popup.dispatchEvent(new Event("toggle"));
  assert.equal(button.disabled, true); assert.equal(requests, 0);
});
test("Escape closes a native disclosure and restores its summary without a document command", () => {
  let requests = 0, focused = 0;
  const popup = Object.assign(new EventTarget(), { open: true, querySelector: selector => selector === "summary" ? { focus: () => focused++ } : null });
  const button = Object.assign(new EventTarget(), { disabled: false, closest: () => popup });
  const controls = createDocumentMenuControls([{ button, target: { disabled: false, click: () => requests++ } }]);
  const key = value => Object.assign(new Event("keydown", { cancelable: true }), { key: value });
  const other = key("Enter"); popup.dispatchEvent(other);
  assert.equal(popup.open, true); assert.equal(other.defaultPrevented, false);
  for (const patch of [{ isComposing: true }, { keyCode: 229 }]) {
    const composing = Object.assign(key("Escape"), patch); popup.dispatchEvent(composing);
    assert.equal(popup.open, true); assert.equal(composing.defaultPrevented, false);
  }
  const consumed = key("Escape"); consumed.preventDefault(); popup.dispatchEvent(consumed);
  assert.equal(popup.open, true); assert.equal(focused, 0);
  const escape = key("Escape"); popup.dispatchEvent(escape);
  assert.equal(popup.open, false); assert.equal(escape.defaultPrevented, true);
  assert.equal(focused, 1); assert.equal(requests, 0);
  const closedEscape = key("Escape"); popup.dispatchEvent(closedEscape);
  assert.equal(closedEscape.defaultPrevented, false); assert.equal(focused, 1);
  popup.open = true; controls.close(); assert.equal(popup.open, false);
  popup.open = true; popup.dispatchEvent(key("Escape"));
  assert.equal(popup.open, true); assert.equal(focused, 1); assert.equal(requests, 0);
});
