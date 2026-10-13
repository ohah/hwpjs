import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentMenuControls } from "../../web/preview/document-menu-controls.mjs";

function entry(id, label) {
  const handlers = new Map();
  const target = { disabled: false, inherited: false, calls: 0, matches() { return this.inherited; }, click() { this.calls++; } };
  const button = { id, textContent: label, disabled: false, addEventListener(type, callback) { handlers.set(type, callback); },
    removeEventListener(type) { handlers.delete(type); }, closest() { return null; } };
  return { button, target, handlers };
}

test("command metadata and execution share existing menu controls and live eligibility", () => {
  const save = entry("menu-save", " 저장 "), undo = entry("menu-undo", "실행 취소");
  undo.target.disabled = true;
  const menu = createDocumentMenuControls([save, undo]);
  assert.deepEqual(menu.commands(), [{ id: "menu-save", label: "저장", enabled: true }, { id: "menu-undo", label: "실행 취소", enabled: false }]);
  assert.equal(menu.execute("menu-save"), true); assert.equal(save.target.calls, 1);
  save.handlers.get("click")(); assert.equal(save.target.calls, 2, "ordinary menu and registry use the same delegate");
  assert.equal(menu.execute("menu-undo"), false); assert.equal(undo.target.calls, 0);
  const stale = menu.commands();
  save.target.inherited = true;
  assert.equal(stale[0].enabled, true);
  assert.equal(menu.execute("menu-save"), false); assert.equal(save.target.calls, 2);
  undo.target.disabled = false;
  assert.equal(menu.execute("menu-undo"), true); assert.equal(undo.target.calls, 1);
  assert.equal(menu.execute("unknown"), false);
  menu.close(); menu.close();
  assert(menu.commands().every(command => !command.enabled));
  assert.equal(menu.execute("menu-undo"), false);
  assert.equal(undo.handlers.size, 0);
});

test("duplicate command ids are rejected before listeners or actions are installed", () => {
  const a = entry("same", "a"), b = entry("same", "b");
  assert.throws(() => createDocumentMenuControls([a, b]), /AmbiguousDocumentMenuCommand/);
  assert.equal(a.handlers.size, 0); assert.equal(b.handlers.size, 0);
  assert.equal(a.target.calls + b.target.calls, 0);
});
