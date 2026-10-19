import test from "node:test";
import assert from "node:assert/strict";
import { createParagraphBreakApi } from "../../js/paragraph-break-api.mjs";

function fixture(endAsCount) {
  let closed = false;
  const calls = [];
  const wasm = {};
  const api = createParagraphBreakApi({ wasm, memory: { error: () => new Error("NativeFailure") }, check() { if (closed) throw new Error("EditorClosed"); }, uint(value) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError("InvalidInteger"); }, prefix: "test_edit", endAsCount, unavailable: "BreakAbiUnavailable" });
  return { api, wasm, calls, close() { closed = true; }, enable(result) { const output = arguments.length === 0 ? 1 : result; wasm.test_edit_split_with_break = (...args) => { calls.push(args); return output; }; } };
}

for (const endAsCount of [false, true]) {
  test(`flow break optional ABI uses ${endAsCount ? "deleted count" : "end position"} without plain fallback`, () => {
    const f = fixture(endAsCount);
    const args = { section: 2, paragraph: 17, atUnit: 3, endUnit: 9, kind: "page" };
    f.wasm.test_edit_split = () => assert.fail("must not split without flow intent");
    assert.equal(f.api.supportsParagraphBreaks(), false);
    assert.throws(() => f.api.splitParagraphWithBreak(args), /BreakAbiUnavailable/);
    f.enable();
    assert.equal(f.api.supportsParagraphBreaks(), true);
    f.api.splitParagraphWithBreak(args);
    f.api.splitParagraphWithBreak({ ...args, kind: "column" });
    f.api.splitParagraphWithBreak({ section: 0, paragraph: 1, atUnit: 0, kind: "page" });
    assert.deepEqual(f.calls, [[2, 17, 3, endAsCount ? 6 : 9, 1], [2, 17, 3, endAsCount ? 6 : 9, 2], [0, 1, 0, 0, 1]]);
    f.close();
    assert.throws(() => f.api.supportsParagraphBreaks(), /EditorClosed/);
    assert.throws(() => f.api.splitParagraphWithBreak({ ...args, kind: "wrong" }), /EditorClosed/);
  });

  test(`flow break validates all inputs before native mutation (${endAsCount})`, () => {
    const f = fixture(endAsCount); f.enable();
    const args = { section: 0, paragraph: 1, atUnit: 0, endUnit: 2, kind: "column" };
    for (const key of ["section", "paragraph", "atUnit", "endUnit"]) {
      for (const value of [-1, 0x100000000, NaN, Infinity, 0.5, "1", true, null, undefined]) {
        if (key === "endUnit" && value === undefined) continue; // documented default
        assert.throws(() => f.api.splitParagraphWithBreak({ ...args, [key]: value }), /InvalidInteger/);
      }
    }
    assert.throws(() => f.api.splitParagraphWithBreak({ ...args, atUnit: 3 }), /InvalidTextPosition/);
    for (const kind of [undefined, null, 0, 1, 2, true, "PAGE", "", {}, []]) assert.throws(() => f.api.splitParagraphWithBreak({ ...args, kind }), /InvalidParagraphBreakKind/);
    assert.deepEqual(f.calls, []);
    f.api.splitParagraphWithBreak({ section: 0xffffffff, paragraph: 0xffffffff, atUnit: 0xffffffff, endUnit: 0xffffffff, kind: "column" });
    assert.deepEqual(f.calls, [[0xffffffff, 0xffffffff, 0xffffffff, endAsCount ? 0 : 0xffffffff, 2]]);
  });

  test(`flow break propagates native refusal and does not retry (${endAsCount})`, () => {
    const f = fixture(endAsCount);
    for (const result of [0, 2, -1, undefined, "1", true, NaN]) {
      f.enable(result);
      assert.throws(() => f.api.splitParagraphWithBreak({ section: 0, paragraph: 1, atUnit: 0, kind: "page" }), /NativeFailure/);
    }
    assert.equal(f.calls.length, 7);
  });
}
