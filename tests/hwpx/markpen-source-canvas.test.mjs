import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("Canvas input edits an actual empty markpen paragraph with exact saved history", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit markpen candidate required");
  const input = readFileSync("reference/rhwp/samples/정책연구용역사업 중간진도보고서(살아있는 간장 기증자의 의학적 선별기준 연구).hwpx");
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  const row = loaded.content.paragraphs.find(p => p.section === 0 && p.paragraph === 26);
  assert(row);
  assert.equal(row.text, "");
  assert.equal(row.plainEditable, true);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 26, startUnit: 0, endUnit: 0 }), true);
  const text = "입력😀<&";
  dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: text, isComposing: false });
  h.input.value = text;
  h.input.setSelectionRange(text.length, text.length);
  dispatchCanvasEvent(h.input, "input");
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  assert.equal(changed.content.paragraphs.find(p => p.section === 0 && p.paragraph === 26).text, text);
  const saved = Buffer.from((await h.send({ kind: "save" })).bytes);
  for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
    input: JSON.stringify({ before: input.toString("base64"), after: saved.toString("base64"), section: 0, paragraph: 27, text }), timeout: 30000,
  });
  assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal((await h.send({ kind: "redo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
});
