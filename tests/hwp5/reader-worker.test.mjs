import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";

test("actual HWP5 Worker save refusal retains edits and native session for retry", async t => {
  const originalSelf = globalThis.self, originalFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage(message) { replies.push(message); } };
  globalThis.fetch = async () => new Response(readFileSync("zig-out/bin/hwpjs.wasm"));
  t.after(() => { globalThis.fetch = originalFetch; if (originalSelf === undefined) delete globalThis.self; else globalThis.self = originalSelf; });
  await import(`../../web/preview/reader-worker.mjs?save-regression=${Date.now()}`);
  const send = async message => { await self.onmessage({ data: { origin: "save-test", ...message } }); const reply = replies.shift(); assert(reply); assert.equal(replies.length, 0); return reply; };
  const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  assert.equal((await send({ kind: "load", bytes: source })).error, undefined);
  assert.equal((await send({ kind: "save" })).error, "EditorNotOpen");
  assert.equal((await send({ kind: "enable" })).error, undefined);
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
  assert.equal((await send({ kind: "splice", section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "검증😀" })).error, undefined);
  const refused = await send({ kind: "save" });
  assert.equal(refused.error, "LayoutReflowRequired"); assert.equal(refused.applied, false);
  assert.equal((await send({ kind: "save", allowStaleLayout: "true" })).error, "InvalidStaleLayoutPolicy");
  assert.equal((await send({ kind: "splice", section: 0, paragraph: 1, startUnit: 4, endUnit: 4, text: "다음" })).error, undefined);
  const saved = await send({ kind: "save", allowStaleLayout: true });
  assert.equal(saved.error, undefined); assert.equal(saved.layoutRequiresReflow, true); assert.equal(saved.format, "hwp5");
  const reopened = await createExperimentalHwp5Editor(readFileSync("zig-out/bin/hwpjs.wasm"), saved.bytes);
  try { assert(reopened.text(0, 1).startsWith("검증😀다음")); } finally { reopened.close(); }
  assert.deepEqual((await send({ kind: "save", allowStaleLayout: true })).bytes, saved.bytes);
});

test("actual Worker refreshes dependent chart formula after a plain numeric cell edit", async t => {
  const originalSelf = globalThis.self, originalFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage(message) { replies.push(message); } };
  globalThis.fetch = async () => new Response(readFileSync("zig-out/bin/hwpjs.wasm"));
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalSelf === undefined) delete globalThis.self; else globalThis.self = originalSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?formula-regression=${Date.now()}`);
  const send = async message => {
    await self.onmessage({ data: { origin: "formula", ...message } });
    const reply = replies.shift(); assert(reply); assert.equal(replies.length, 0); return reply;
  };
  const get = (reply, index) => reply.content.paragraphs.find(p => p.section === 0 && p.paragraph === index);
  const loaded = await send({ kind: "load", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp") });
  assert.equal(loaded.error, undefined); assert.equal(get(loaded, 23).text, "«67.5»");
  assert.equal((await send({ kind: "enable" })).error, undefined);
  const changed = await send({ kind: "splice", section: 0, paragraph: 19, startUnit: 1, endUnit: 2, text: "2" });
  assert.equal(changed.error, undefined);
  assert.equal(get(changed, 19).text, "12.2");
  assert.equal(get(changed, 23).text, "«68.5»");
});

test("actual Worker preserves tab projection, repeated edits and refusal without payload decoding", async t => {
  const originalSelf = globalThis.self, originalFetch = globalThis.fetch;
  const replies = [];
  globalThis.self = { postMessage(message) { replies.push(message); } };
  globalThis.fetch = async () => new Response(readFileSync("zig-out/bin/hwpjs.wasm"));
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalSelf === undefined) delete globalThis.self; else globalThis.self = originalSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?tab-regression=${Date.now()}`);
  const send = async message => {
    await self.onmessage({ data: { origin: "regression", ...message } });
    const reply = replies.shift(); assert(reply); assert.equal(replies.length, 0); return reply;
  };
  const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/software.hwp");
  const loaded = await send({ kind: "load", bytes: source }); assert.equal(loaded.error, undefined);
  const get = (reply, index) => reply.content.paragraphs.find(p => p.section === 0 && p.paragraph === index);
  const tab = get(loaded, 33); assert.equal(tab.editable, true); assert.equal(tab.text, "\t- ");
  assert.deepEqual(tab.sourceOffsets, [{ at: 0, source: 0 }, { at: 1, source: 8 }]);
  assert.equal((await send({ kind: "enable" })).error, undefined);
  const plain = await send({ kind: "splice", section: 0, paragraph: 2, startUnit: 0, endUnit: 0, text: "먼저" });
  assert.equal(plain.error, undefined);
  const first = await send({ kind: "splice", section: 0, paragraph: 33, startUnit: 8, endUnit: 10, text: "한😀" });
  assert.equal(first.error, undefined); assert.equal(get(first, 33).text, "\t한😀");
  assert.equal(get(first, 33).editable, true); assert(get(first, 33).label.includes("제어 표식 2개"));
  assert.equal(get(first, 2).text, get(plain, 2).text, "reprojection lost a previous edit");
  const rejected = await send({ kind: "splice", section: 0, paragraph: 33, startUnit: 1, endUnit: 1, text: "실패" });
  assert.equal(rejected.error, "SplitControlToken"); assert.equal(rejected.applied, false);
  const second = await send({ kind: "splice", section: 0, paragraph: 33, startUnit: 11, endUnit: 11, text: "끝" });
  assert.equal(second.error, undefined); assert.equal(get(second, 33).text, "\t한😀끝");
  assert.equal(get(second, 33).editable, true);
});
