import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("queued numeric typing preserves two native checkpoints and exact undo redo saves", async t => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: source })).error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 19, startUnit: 0, endUnit: 4 }), true);
  assert.equal(h.input.value, "11.2");
  dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: "7" });
  h.input.value = "7"; h.input.setSelectionRange(1, 1); dispatchCanvasEvent(h.input, "input");
  assert.equal(h.controller.history("undo"), false, "unacknowledged input must block history");
  dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: "0" });
  h.input.value = "70"; h.input.setSelectionRange(2, 2); dispatchCanvasEvent(h.input, "input");
  assert.equal((await h.flush()).error, undefined);
  assert.equal(h.input.value, "70", "first acknowledgement must preserve queued text");
  assert.equal((await h.flush()).error, undefined);
  assert.equal(h.input.value, "70");
  const edited = (await h.send({ kind: "save" })).bytes;
  for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-structure-formula-oracle.py"], {
    input: JSON.stringify({ before: source.toString("base64"), after: Buffer.from(edited).toString("base64"), value: "70" }), timeout: 30000,
  });
  assert.equal(h.controller.history("undo"), true);
  assert.equal(h.controller.history("undo"), false, "pending travel must not dispatch twice");
  assert.equal((await h.flush()).error, undefined);
  const intermediate = (await h.send({ kind: "save" })).bytes;
  assert.equal(h.input.value, "7");
  dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertReplacementText", data: "bad" });
  h.input.value = "bad"; h.input.setSelectionRange(3, 3); dispatchCanvasEvent(h.input, "input");
  assert.equal((await h.flush()).error, "InvalidFormulaNumber");
  assert.equal(h.input.value, "7");
  assert.deepEqual((await h.send({ kind: "save" })).bytes, intermediate);
  assert.equal(h.controller.history("undo"), true);
  assert.equal((await h.flush()).error, undefined);
  assert.equal(h.input.value, "11.2");
  assert(Buffer.from((await h.send({ kind: "save" })).bytes).equals(source));
  assert.equal(h.controller.history("redo"), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: "save" })).bytes, intermediate);
  assert.equal(h.controller.history("redo"), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: "save" })).bytes, edited);
});
