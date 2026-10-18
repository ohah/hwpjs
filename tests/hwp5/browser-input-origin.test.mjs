import test from "node:test";
import assert from "node:assert/strict";
import { moveBrowserInputToStart } from "../../tools/browser/input-origin.mjs";

test("browser input origin uses document-start keys and proves a collapsed zero caret", () => {
  for (const mac of [false, true]) {
    const calls = [], states = [{ active: true, writable: true, start: 4, end: 4, mac }, { active: true, writable: true, start: 0, end: 0, mac }];
    moveBrowserInputToStart({ command: (...args) => calls.push(args), evaluate: () => states.shift() });
    assert.deepEqual(calls, [["focus", "#canvas-input"], ["press", mac ? "Meta+ArrowUp" : "Control+Home"]]);
  }
});

test("a successful key command cannot substitute for an active writable zero caret", () => {
  for (const bad of [{ active: false, writable: true, start: 0, end: 0 }, { active: true, writable: false, start: 0, end: 0 }, { active: true, writable: true, start: 4, end: 4 }, { active: true, writable: true, start: 0, end: 6 }]) {
    const states = [{ active: true, writable: true, start: 6, end: 6, mac: false }, bad];
    assert.throws(() => moveBrowserInputToStart({ command() {}, evaluate: () => states.shift() }), /BrowserInputOriginNotReached/);
  }
  assert.throws(() => moveBrowserInputToStart({ command() {}, evaluate: () => ({ active: true, writable: false }) }), /BrowserInputOriginUnavailable/);
});
