import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { executeOracle } from "../../tools/oracle-process-async.mjs";

test("actual unknown drawing anchors preserve Canvas permission Worker history and saved XML", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitCandidateRequired");
  const input = readFileSync("reference/rhwp/samples/issue6035/cgmp_evaluation_table.hwpx"),
    h = await workerCanvasHarness(t);
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: input })).error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const view = await h.send({ kind: "set-edit-window", offset: 931, count: 1 });
  assert.equal(view.error, undefined);
  const row = view.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 931);
  assert(row);
  assert.equal(row.plainEditable, false);
  assert.equal(row.anchorEditable, true);
  assert.equal(row.text, "\ufffc".repeat(6));
  for (let startUnit = 0; startUnit < 6; startUnit++) {
    const refused = await h.send({
      kind: "splice",
      section: 0,
      paragraph: 931,
      startUnit,
      endUnit: startUnit + 1,
      text: "",
    });
    assert.match(refused.error, /ProtectedInlineControl/);
    assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  }
  const point = { section: 0, paragraph: 931, startUnit: 0, endUnit: 0 };
  assert.equal(h.controller.selectTextRange(point), true);
  assert.equal(h.input.readOnly, false);
  const text = "화면보존개체😀<&";
  assert.equal(
    dispatchCanvasEvent(h.input, "beforeinput", {
      inputType: "insertText",
      data: text,
      isComposing: false,
    }).defaultPrevented,
    false,
  );
  h.input.value = text + row.text;
  h.input.setSelectionRange(text.length, text.length);
  dispatchCanvasEvent(h.input, "input");
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(h.requests.at(-1), { kind: "splice", origin: "canvas", ...point, text });
  const saved = Buffer.from((await h.send({ kind: "save" })).bytes);
  const request = {
    mode: "anchored",
    before: input.toString("base64"),
    after: saved.toString("base64"),
    section: 0,
    paragraph: 932,
    text,
  };
  for (const flags of [[], ["-O"]])
    await executeOracle("python3", [...flags, "tools/hwpx-unknown-anchor-oracle.py"], {
      input: JSON.stringify(request),
      timeout: 30000,
    });
  for (const action of ["undo", "redo"]) {
    assert.equal(h.controller.history(action), true);
    assert.equal((await h.flush()).error, undefined);
    assert.deepEqual(
      Buffer.from((await h.send({ kind: "save" })).bytes),
      action === "undo" ? input : saved,
    );
  }
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: saved })).error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const reopened = await h.send({ kind: "set-edit-window", offset: 931, count: 1 });
  assert.equal(reopened.error, undefined);
  assert.equal(reopened.content.paragraphs.find((p) => p.paragraph === 931).text, text + row.text);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
  t.diagnostic(
    "real Worker/WASM; simulated Canvas and metrics, not unknown-object rendering or a real browser",
  );
});
