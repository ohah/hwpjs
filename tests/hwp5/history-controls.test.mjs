import assert from "node:assert/strict";
import test from "node:test";
import { createHistoryControls } from "../../web/preview/history-controls.mjs";

test("history buttons derive gating on update and click without storing native history", () => {
  const undo = new EventTarget(), redo = new EventTarget(), requests = [];
  let enabled = false;
  const controls = createHistoryControls({ undo, redo, canRequest: () => enabled, request(kind) { requests.push(kind); enabled = false; } });
  assert.equal(undo.disabled, true); assert.equal(redo.disabled, true);
  undo.dispatchEvent(new Event("click")); assert.deepEqual(requests, []);
  enabled = true; controls.update(); assert.equal(undo.disabled, false);
  undo.dispatchEvent(new Event("click")); assert.deepEqual(requests, ["undo"]);
  assert.equal(undo.disabled, true); assert.equal(redo.disabled, true);
  enabled = true; controls.update(); enabled = false;
  redo.dispatchEvent(new Event("click")); assert.deepEqual(requests, ["undo"]);
  enabled = true; controls.update(); redo.dispatchEvent(new Event("click"));
  assert.deepEqual(requests, ["undo", "redo"]);
  enabled = true; controls.close(); undo.dispatchEvent(new Event("click"));
  assert.equal(undo.disabled, true); assert.deepEqual(requests, ["undo", "redo"]);
});
