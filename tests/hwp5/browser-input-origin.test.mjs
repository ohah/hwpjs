import test from "node:test";
import assert from "node:assert/strict";
import { moveBrowserInputToStart, selectBrowserInputRange } from "../../tools/browser/input-origin.mjs";

test("browser input origin uses document-start keys and proves a collapsed zero caret", () => {
  for (const mac of [false, true]) {
    const calls = [], states = [{ active: true, writable: true, start: 4, end: 4, mac }, { active: true, writable: true, start: 0, end: 0, mac }];
    moveBrowserInputToStart({ command: (...args) => calls.push(args), evaluate: () => states.shift() });
    assert.deepEqual(calls, [["focus", "#canvas-input"], ["press", mac ? "Meta+ArrowUp" : "Control+Home"]]);
  }
});

test("browser interior range uses actual arrows and refuses a forged or split selection", () => {
  const calls = [], text = "A😀BC";
  const states = [{ active: true, writable: true, start: 0, end: 0, mac: false }, { active: true, writable: true, start: 0, end: 0 }, { value: text, start: 3, end: 4 }];
  selectBrowserInputRange({ command: (...args) => calls.push(args), evaluate: () => states.shift() }, text, 3, 4);
  assert.deepEqual(calls, [["focus", "#canvas-input"], ["press", "Control+Home"], ["press", "ArrowRight"], ["press", "ArrowRight"], ["press", "Shift+ArrowRight"]]);
  for (const [start, end] of [[-1, 1], [2, 1], [0, 6], [0.5, 1], [0, NaN]]) assert.throws(() => selectBrowserInputRange({}, text, start, end), /InvalidBrowserInputRange/);
  for (const [start, end] of [[2, 3], [1, 2]]) assert.throws(() => selectBrowserInputRange({}, text, start, end), /SplitBrowserInputSurrogate/);
  for (const wrong of [{ value: text, start: 0, end: 4 }, { value: "wrong", start: 3, end: 4 }]) {
    let n = 0;
    assert.throws(() => selectBrowserInputRange({ command() {}, evaluate: () => ++n < 3 ? { active: true, writable: true, start: 0, end: 0 } : wrong }, text, 3, 4), /BrowserInputRangeNotReached/);
  }
});

test("a successful key command cannot substitute for an active writable zero caret", () => {
  for (const bad of [{ active: false, writable: true, start: 0, end: 0 }, { active: true, writable: false, start: 0, end: 0 }, { active: true, writable: true, start: 4, end: 4 }, { active: true, writable: true, start: 0, end: 6 }]) {
    const states = [{ active: true, writable: true, start: 6, end: 6, mac: false }, bad];
    assert.throws(() => moveBrowserInputToStart({ command() {}, evaluate: () => states.shift() }), /BrowserInputOriginNotReached/);
  }
  assert.throws(() => moveBrowserInputToStart({ command() {}, evaluate: () => ({ active: true, writable: false }) }), /BrowserInputOriginUnavailable/);
});
