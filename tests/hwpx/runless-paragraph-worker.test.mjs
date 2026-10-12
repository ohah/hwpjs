import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("runless reference paragraph Worker input saves and preserves undo redo", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit runless candidate required");
  const input = readFileSync("reference/rhwp/samples/hwpx/opengov/36386761_백제학연구총서위탁판매의뢰목록.hwpx");
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  assert.deepEqual(loaded.content.paragraphs.find(p => p.section === 0 && p.paragraph === 27).characterRanges, [{ start: 0, end: 0, charShapeId: 2 }]);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 27, startUnit: 0, endUnit: 0 }), true);
  const text = "본문😀<&";
  dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: text, isComposing: false });
  h.input.value = text; h.input.setSelectionRange(text.length, text.length);
  dispatchCanvasEvent(h.input, "input");
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  assert.equal(changed.content.paragraphs.find(p => p.section === 0 && p.paragraph === 27).text, "본문😀<&");
  const row = changed.content.paragraphs.find(p => p.section === 0 && p.paragraph === 27);
  assert.equal(row.characterRangesError, undefined);
  assert.deepEqual(row.characterRanges, [{ start: 0, end: text.length, charShapeId: 2 }]);
  const saved = Buffer.from((await h.send({ kind: "save" })).bytes);
  const request = { before: input.toString("base64"), after: saved.toString("base64"), section: 0, localParagraph: 27, text };
  for (const flags of [[], ["-O"]]) {
    const verify = value => JSON.parse(execFileSync("python3", [...flags, "tools/hwpx-runless-input-oracle.py"], { input: JSON.stringify(value), encoding: "utf8", timeout: 30000 }));
    assert.equal(verify(request).characterId, "2");
    assert.throws(() => verify({ ...request, text: "wrong" }), error => error.status === 1 && /Complete XML mismatch/.test(String(error.stderr)));
  }
  assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal((await h.send({ kind: "redo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
});

test("runless Worker transaction preserves a prior paragraph edit and separate history entries", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit runless candidate required");
  const input = readFileSync("reference/rhwp/samples/hwpx/opengov/36386761_백제학연구총서위탁판매의뢰목록.hwpx");
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const other = loaded.content.paragraphs.find(p => p.section === 0 && p.paragraph !== 27 && p.plainEditable && p.text.length > 0);
  assert(other, "fixture must expose a second editable paragraph");
  const prefix = "이전😀<&";
  const prior = await h.send({ kind: "splice", origin: "canvas", section: 0, paragraph: other.paragraph, startUnit: 0, endUnit: 0, text: prefix });
  assert.equal(prior.error, undefined);
  assert.deepEqual(prior.content.paragraphs.find(p => p.section === 0 && p.paragraph === 27).characterRanges, [{ start: 0, end: 0, charShapeId: 2 }]);
  assert.equal(prior.content.paragraphs.find(p => p.section === 0 && p.paragraph === other.paragraph).text, prefix + other.text);
  const priorSaved = Buffer.from((await h.send({ kind: "save" })).bytes);
  const text = "새 문단😀<&";
  const changed = await h.send({ kind: "splice", origin: "canvas", section: 0, paragraph: 27, startUnit: 0, endUnit: 0, text });
  assert.equal(changed.error, undefined);
  assert.equal(changed.content.paragraphs.find(p => p.section === 0 && p.paragraph === other.paragraph).text, prefix + other.text);
  const saved = Buffer.from((await h.send({ kind: "save" })).bytes);
  for (const flags of [[], ["-O"]]) {
    const result = JSON.parse(execFileSync("python3", [...flags, "tools/hwpx-runless-input-oracle.py"], { input: JSON.stringify({ before: priorSaved.toString("base64"), after: saved.toString("base64"), section: 0, localParagraph: 27, text }), encoding: "utf8", timeout: 30000 }));
    assert.equal(result.verified, true);
  }
  assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), priorSaved);
  const refused = await h.send({ kind: "splice", origin: "canvas", section: 0, paragraph: 27, startUnit: 1, endUnit: 1, text: "bad" });
  assert.equal(refused.error, "InvalidTextPosition");
  assert.equal((await h.send({ kind: "redo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
  assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal((await h.send({ kind: "redo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), priorSaved);
  assert.equal((await h.send({ kind: "redo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
});
