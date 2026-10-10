import test from "node:test";
import assert from "node:assert/strict";
import { createMenuDisclosures } from "../../web/preview/document-menu-disclosures.mjs";

test("menu hover transfers only an already open disclosure and outside pointers do not consume input", () => {
  const document = new EventTarget();
  const make = () => {
    const summary = Object.assign(new EventTarget(), { nodeType: 1 }), child = { nodeType: 1 };
    const popup = { nodeType: 1, open: false, ownerDocument: document,
      contains: node => {
        if (typeof node?.nodeType !== "number") throw new TypeError("ExpectedNode");
        return node === popup || node === child || node === summary;
      },
      querySelector: () => summary, setAttribute(key, value) { this[key] = value; } };
    return { popup, summary, child };
  };
  const a = make(), b = make(), controls = createMenuDisclosures([a.popup, b.popup]);
  assert.equal(a.popup.name, "hwpjs-document-menu");
  assert.equal(b.popup.name, a.popup.name);
  b.summary.dispatchEvent(new Event("pointerenter")); assert.equal(b.popup.open, false);
  a.popup.open = true;
  b.summary.dispatchEvent(Object.assign(new Event("pointerenter"), { pointerType: "touch" }));
  assert.equal(a.popup.open, true); assert.equal(b.popup.open, false);
  b.summary.dispatchEvent(Object.assign(new Event("pointerenter"), { pointerType: "mouse" }));
  assert.equal(a.popup.open, false); assert.equal(b.popup.open, true);
  const inside = Object.assign(new Event("pointerdown", { cancelable: true }), { composedPath: () => [b.child, document] });
  document.dispatchEvent(inside); assert.equal(b.popup.open, true); assert.equal(inside.defaultPrevented, false);
  const outside = Object.assign(new Event("pointerdown", { cancelable: true }), { composedPath: () => [document, { window: true }] });
  document.dispatchEvent(outside); assert.equal(b.popup.open, false); assert.equal(outside.defaultPrevented, false);
  a.popup.open = true; controls.close(); controls.close(); assert.equal(a.popup.open, false);
  a.popup.open = true; b.summary.dispatchEvent(new Event("pointerenter"));
  assert.equal(a.popup.open, true); assert.equal(b.popup.open, false);
  document.dispatchEvent(new Event("pointerdown")); assert.equal(a.popup.open, true);
});
