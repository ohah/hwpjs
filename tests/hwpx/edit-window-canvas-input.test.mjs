import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("failed window navigation preserves Canvas selection and successful navigation clears stale selection", async t => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx");
  await h.send({ kind: "load", format: "hwpx", bytes: input });
  const full = await h.send({ kind: "enable" });
  const target = full.content.paragraphs.find(p => p.plainEditable && p.text.length > 1);
  assert.ok(target); h.paint();
  assert.equal(h.controller.selectTextRange({ section: target.section, paragraph: target.paragraph, startUnit: 0, endUnit: 1 }), true);
  const selection = h.controller.selectedRange(), value = h.input.value;
  const invalid = { kind: "set-edit-window", offset: -1, count: 1 };
  h.controller.external(invalid);
  assert.deepEqual(h.controller.selectedRange(), selection);
  assert.equal((await h.send(invalid)).error, "InvalidParagraphWindow");
  assert.deepEqual(h.controller.selectedRange(), selection);
  assert.equal(h.input.value, value);
  assert.equal(h.input.disabled, false);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  const valid = { kind: "set-edit-window", offset: target.paragraph, count: 1 };
  h.controller.external(valid);
  assert.deepEqual(h.controller.selectedRange(), selection);
  assert.equal((await h.send(valid)).error, undefined);
  assert.equal(h.controller.selectedRange(), null);
  assert.equal(h.input.disabled, true);
});

test("actual Renderer Canvas input retains sparse window paragraph coordinates and independent saved XML", async t => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx");
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: input })).error, undefined);
  const full = await h.send({ kind: "enable" });
  const target = full.content.paragraphs.find(p => p.plainEditable && p.paragraph > 0);
  assert.ok(target);
  const navigation = { kind: "set-edit-window", offset: target.paragraph, count: 1 };
  h.controller.external(navigation);
  const shown = await h.send(navigation);
  assert.equal(shown.error, undefined);
  assert.equal(h.renderer.layout().state, "paginated");
  h.paint();
  assert.equal(h.controller.selectTextRange({ section: target.section, paragraph: target.paragraph, startUnit: 0, endUnit: 0 }), true);
  const text = "구간😀<&";
  h.input.value = text + h.input.value;
  h.input.setSelectionRange(text.length, text.length);
  dispatchCanvasEvent(h.input, "input", { inputType: "insertText", data: text });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].paragraph, target.paragraph);
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  assert.equal(changed.content.window.requestedOffset, target.paragraph);
  assert.equal(changed.content.paragraphs.find(p => p.paragraph === target.paragraph).text, text + target.text);
  const saved = (await h.send({ kind: "save" })).bytes;
  for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-plain-splice-oracle.py"], {
    input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64"),
      part: "Contents/section0.xml", index: target.paragraph, start: 0, end: 0, text }), timeout: 30000,
  });
  assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal((await h.send({ kind: "redo" })).error, undefined);
  assert.deepEqual((await h.send({ kind: "save" })).bytes, saved);
});
