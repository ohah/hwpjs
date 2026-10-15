import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("a real HWPX document beyond the default paragraph cap edits its last native paragraph through a window", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const timings = [];
  const timed = async (stage, action) => {
    const start = performance.now(), result = await action();
    timings.push({ stage, milliseconds: Math.round((performance.now() - start) * 100) / 100 });
    console.info(JSON.stringify({ kind: "long-document-stage", ...timings.at(-1) }));
    return result;
  };
  // The filename describes its conversion history; this is an actual ZIP/HWPX.
  const input = readFileSync("reference/rhwp/samples/hwp3-sample10-hwpx.hwpx");
  assert.equal(input.readUInt32LE(0), 0x04034b50);
  const h = await workerCanvasHarness(t);
  const loaded = await timed("load", () => h.send({ kind: "load", format: "hwpx", bytes: input })); assert.equal(loaded.error, undefined);
  const total = loaded.content.totalParagraphs;
  assert.equal(total, 26939); assert.equal(loaded.content.limited, true);
  const enabled = await timed("enable", () => h.send({ kind: "enable" })); assert.equal(enabled.error, undefined);
  const original = await timed("last-window", () => h.send({ kind: "set-edit-window", offset: total - 1, count: 1 }));
  assert.equal(original.error, undefined);
  const target = original.content.paragraphs.find(row => row.section === 0 && row.paragraph === total - 1);
  assert(target?.editable); assert(!target.clipped);
  assert.equal(original.historyRevision, enabled.historyRevision);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: target.paragraph, startUnit: 0, endUnit: 0 }), true);
  const text = "끝구간😀";
  dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: text });
  h.input.value = text + target.text; h.input.setSelectionRange(text.length, text.length); dispatchCanvasEvent(h.input, "input");
  const changed = await timed("input", () => h.flush()); assert.equal(changed.error, undefined);
  assert.equal(changed.content.window.requestedOffset, total - 1);
  assert.equal(h.input.value, text + target.text);
  assert.deepEqual(h.renderer.findText(text).matches, [{ section: 0, paragraph: target.paragraph, startUnit: 0, endUnit: text.length }]);
  const savedReply = await timed("save", () => h.send({ kind: "save" })); assert.equal(savedReply.error, undefined);
  const saved = Buffer.from(savedReply.bytes);
  for (const flags of [[], ["-O"]]) {
    const request = { before: input.toString("base64"), after: saved.toString("base64"), section: 0, paragraph: total, text, mode: "plain_text" };
    execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(request), timeout: 30000 });
    assert.throws(() => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify({ ...request, text: "wrong" }), timeout: 30000 }), error => error.status !== 0 && String(error.stderr).includes("complete XML mismatch"));
  }
  assert.equal(h.controller.history("undo"), true); assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal(h.controller.history("redo"), true); assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
  assert.equal((await timed("reopen", () => h.send({ kind: "load", format: "hwpx", bytes: saved }))).error, undefined);
  assert.equal((await timed("reenable", () => h.send({ kind: "enable" }))).error, undefined);
  const reopened = await h.send({ kind: "set-edit-window", offset: total - 1, count: 1 }); assert.equal(reopened.error, undefined);
  assert.equal(reopened.content.paragraphs.find(row => row.section === 0 && row.paragraph === target.paragraph).text, text + target.text);
  assert.deepEqual(readFileSync("reference/rhwp/samples/hwp3-sample10-hwpx.hwpx"), input);
  t.diagnostic(JSON.stringify({ timings, scope: "single concurrent run including Worker/renderer; not isolated native getter timings" }));
  t.diagnostic("26939 original paragraphs; one last-paragraph edit with independent full XML/ZIP; no whole-document search or layout proof");
});
