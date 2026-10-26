import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";

test("programmatic Canvas selection retains backward affinity without stealing toolbar focus", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitCandidateRequired");
  const h = await workerCanvasHarness(t);
  assert.equal(
    (
      await h.send({
        kind: "load",
        format: "hwpx",
        bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx"),
      })
    ).error,
    undefined,
  );
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  let focuses = 0;
  const focus = h.input.focus.bind(h.input);
  h.input.focus = () => {
    focuses++;
    focus();
  };
  const target = { section: 0, paragraph: 5, startUnit: 0, endUnit: 4, affinity: "backward" };
  assert.equal(h.controller.selectTextRange(target, { focusInput: false }), true);
  assert.equal(focuses, 0);
  assert.equal(h.input.selectionStart, 0);
  assert.equal(h.input.selectionEnd, 4);
  assert.equal(h.input.selectionDirection, "backward");
  assert.equal(h.controller.selectTextRange({ ...target, affinity: "forward" }), true);
  assert.equal(focuses, 1);
  const before = [
    h.input.value,
    h.input.selectionStart,
    h.input.selectionEnd,
    h.input.selectionDirection,
  ];
  assert.equal(h.controller.selectTextRange({ ...target, affinity: "invalid" }), false);
  assert.deepEqual(
    [h.input.value, h.input.selectionStart, h.input.selectionEnd, h.input.selectionDirection],
    before,
  );
});
