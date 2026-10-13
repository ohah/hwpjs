import test from "node:test";
import assert from "node:assert/strict";
import { navigateDocumentMenu } from "../../web/preview/document-menu-keyboard.mjs";
import { createDocumentMenuControls } from "../../web/preview/document-menu-controls.mjs";

test("menu focus navigation opens at edges and wraps without issuing commands", () => {
  const summary = {}, focused = [], buttons = [0, 1, 2].map(index => ({ focus: () => focused.push(index) }));
  const popup = { open: false, querySelector: () => summary };
  const event = (key, target, extra = {}) => ({ key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra });
  assert.equal(navigateDocumentMenu(event("Home", summary), popup, buttons), false);
  assert.equal(navigateDocumentMenu(event("ArrowUp", summary), popup, buttons), true);
  assert.equal(popup.open, true); assert.deepEqual(focused, [2]);
  for (const [key, index, expected] of [["ArrowDown", 2, 0], ["ArrowUp", 0, 2], ["Home", 2, 0], ["End", 0, 2]]) {
    assert.equal(navigateDocumentMenu(event(key, buttons[index]), popup, buttons), true);
    assert.equal(focused.at(-1), expected);
  }
  const before = focused.length;
  for (const extra of [{ defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { altKey: true }, { ctrlKey: true }, { metaKey: true }]) assert.equal(navigateDocumentMenu(event("ArrowDown", summary, extra), popup, buttons), false);
  assert.equal(navigateDocumentMenu(event("ArrowDown", {}), popup, buttons), false);
  assert.equal(navigateDocumentMenu(event("ArrowDown", summary), popup, []), false);
  assert.equal(focused.length, before);
});

test("menu controller skips disabled targets and cannot focus after disposal", () => {
  const summary = new EventTarget(), focused = [], popup = Object.assign(new EventTarget(), { open: false, querySelector: selector => selector === "summary" ? summary : null });
  const targets = [{ disabled: false, click() { throw Error("UnexpectedCommand"); } }, { disabled: true, click() { throw Error("UnexpectedCommand"); } }];
  const buttons = targets.map((target, index) => Object.assign(new EventTarget(), { closest: () => popup, focus: () => focused.push(index) }));
  const controls = createDocumentMenuControls(buttons.map((button, index) => ({ button, target: targets[index] })));
  const key = () => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "ArrowDown" });
    Object.defineProperty(event, "target", { value: summary });
    popup.dispatchEvent(event);
    return event;
  };
  assert.equal(key().defaultPrevented, true); assert.deepEqual(focused, [0]);
  targets[0].disabled = true; assert.equal(key().defaultPrevented, false); assert.deepEqual(focused, [0]);
  controls.close(); targets[0].disabled = false;
  assert.equal(key().defaultPrevented, false); assert.deepEqual(focused, [0]);
});
