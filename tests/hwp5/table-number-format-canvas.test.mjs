import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { verifyCharacterProperties } from "./style-preservation/character-property-oracle.mjs";

test("table number references allow Canvas character formatting while actual Worker rejects text input", async t => {
  const path = "reference/rhwp/samples/hwpspec.hwp";
  if (!existsSync(path)) { t.skip("RHWP reference fixture is unavailable"); return; }
  const input = readFileSync(path), h = await workerCanvasHarness(t);
  assert.equal((await h.send({ kind: "load", format: "hwp5", bytes: input })).error, undefined);
  const enabled = await h.send({ kind: "enable", distribution: true, normalizeObservedCfb: true });
  assert.equal(enabled.error, undefined);
  const row = enabled.content.paragraphs.find(row => row.editable && row.text.length > 0 && !row.clipped && row.characterRanges?.length && row.text.charCodeAt(0) >= 32 && row.text.charCodeAt(0) < 0xd800);
  assert(row, "fixture must expose an optimistic paragraph-local text permission");
  const baseline = Buffer.from((await h.send({ kind: "save" })).bytes);
  const range = { section: row.section, paragraph: row.paragraph, startUnit: 0, endUnit: 1 };
  assert.equal(h.controller.selectTextRange(range), true);
  // Known UI gap: the reader's paragraph-local flag does not represent the
  // transaction's cross-section policy. Native remains authoritative.
  assert.equal(h.input.readOnly, false);
  const text = h.input.value;
  const blocked = dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: "거부" });
  assert.equal(blocked.defaultPrevented, false);
  h.input.value = "거부" + text;
  h.input.setSelectionRange(2, 2);
  dispatchCanvasEvent(h.input, "input");
  assert.equal(h.requests.at(-1).kind, "splice");
  assert.equal((await h.flush()).error, "UnsupportedSectionControl");
  assert.equal(h.input.value, text);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), baseline);
  assert.equal(h.controller.selectTextRange(range), true);
  const oldBold = h.controller.selectedCharacterPropertyState("bold");
  assert.equal(typeof oldBold, "boolean");
  assert.equal(h.controller.setCharacterProperties({ bold: !oldBold }), true);
  const request = h.requests.at(-1);
  assert.equal(request.kind, "character-properties");
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  const current = changed.content.paragraphs.find(row => row.section === range.section && row.paragraph === range.paragraph);
  assert.equal(current.text, text);
  assert.equal(current.editable, true, "known paragraph-local UI permission gap remains visible");
  const saved = await h.send({ kind: "save", allowStaleLayout: true });
  assert.equal(saved.error, undefined);
  assert.equal(verifyCharacterProperties(input, Buffer.from(saved.bytes), request), true);
  assert.equal(h.controller.history("undo"), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), baseline);
  assert.equal(h.controller.history("redo"), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save", allowStaleLayout: true })).bytes), Buffer.from(saved.bytes));
  assert.deepEqual(readFileSync(path), input);
});
