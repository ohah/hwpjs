import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";

test("actual HWP5 Worker history restores whole fixture projections and saved bytes", async t => {
  const originalSelf = globalThis.self, originalFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage(message) { replies.push(message); } };
  globalThis.fetch = async () => new Response(readFileSync("zig-out/bin/hwpjs.wasm"));
  t.after(() => { globalThis.fetch = originalFetch; if (originalSelf === undefined) delete globalThis.self; else globalThis.self = originalSelf; });
  await import(`../../web/preview/reader-worker.mjs?history-regression=${Date.now()}`);
  const send = async message => {
    await self.onmessage({ data: { origin: "history", ...message } });
    const reply = replies.shift(); assert(reply); assert.equal(replies.length, 0); return reply;
  };
  const cases = [
    ["charshape", { kind: "merge", paragraph: 1 }],
    ["charshape", { kind: "split", paragraph: 1, atUnit: 1 }],
    ["software", { kind: "split", paragraph: 2, atUnit: 1 }],
    ["table", { kind: "split", paragraph: 1, atUnit: 0 }],
    ["charshape", { kind: "splice", paragraph: 1, startUnit: 0, endUnit: 0, text: "이력😀" }],
    ["software", { kind: "splice", paragraph: 2, startUnit: 0, endUnit: 0, text: "공모😀" }],
    ["chart", { kind: "splice", paragraph: 19, startUnit: 1, endUnit: 2, text: "2" }],
    ["issue144-fields-crossing-lineseg-boundary", { kind: "splice", paragraph: 2, startUnit: 0, endUnit: 4, text: "필드😀" }],
    ["table", { kind: "splice", paragraph: 1, startUnit: 0, endUnit: 0, text: "빈셀😀" }],
    ["charshape", { kind: "format", paragraph: 1, startUnit: 0, endUnit: 1, charShapeId: 0 }],
  ];
  for (const [name, command] of cases) {
    const source = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const loaded = await send({ kind: "load", bytes: source }); assert.equal(loaded.error, undefined);
    assert.equal((await send({ kind: "undo" })).error, "EditorNotOpen");
    const enabled = await send({ kind: "enable" }); assert.equal(enabled.error, undefined); assert.equal(enabled.historyAvailable, true);
    assert.equal((await send({ kind: "undo" })).changed, false);
    const edited = await send({ section: 0, ...command }); assert.equal(edited.error, undefined, name);
    const saved = await send({ kind: "save", allowStaleLayout: true }); assert.equal(saved.error, undefined);
    assert.notDeepEqual(Buffer.from(saved.bytes), source);
    const undone = await send({ kind: "undo" }); assert.equal(undone.error, undefined); assert.equal(undone.changed, true);
    assert.deepEqual(undone.content, loaded.content, `${name}: all projection metadata must restore`);
    const original = await send({ kind: "save" }); assert.equal(original.error, undefined); assert.equal(original.layoutRequiresReflow, false);
    assert.deepEqual(Buffer.from(original.bytes), source);
    assert.equal((await send({ kind: "enable" })).historyAvailable, true, "repeated enable must not reset redo");
    const refused = await send({ kind: "splice", section: 0, paragraph: 999999, startUnit: 0, endUnit: 0, text: "실패" });
    assert(refused.error); assert.equal(refused.applied, false);
    const redone = await send({ kind: "redo" }); assert.equal(redone.error, undefined); assert.equal(redone.changed, true);
    assert.deepEqual(redone.content, edited.content, `${name}: dependent projections must redo`);
    assert.deepEqual((await send({ kind: "save", allowStaleLayout: true })).bytes, saved.bytes);
    assert.equal((await send({ kind: "redo" })).changed, false);
  }
});

test("older Worker WASM does not advertise unavailable structural editing", async t => {
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  const older = Buffer.from(readFileSync("zig-out/bin/hwpjs.wasm"));
  for (const name of ["hwp5_edit_split_range", "hwp5_edit_split", "hwp5_edit_merge"]) {
    const at = older.indexOf(Buffer.from(name)); assert(at >= 0); older[at] = 120;
  }
  globalThis.self = { postMessage(message) { replies.push(message); } };
  globalThis.fetch = async () => new Response(older);
  t.after(() => { globalThis.fetch = previousFetch; if (previousSelf === undefined) delete globalThis.self; else globalThis.self = previousSelf; });
  await import(`../../web/preview/reader-worker.mjs?old-structure=${Date.now()}`);
  const send = async data => { await self.onmessage({ data }); return replies.shift(); };
  assert.equal((await send({ kind: "load", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp") })).error, undefined);
  const enabled = await send({ kind: "enable" });
  assert.equal(enabled.error, undefined); assert.equal(enabled.structureAvailable, false);
  assert.equal(enabled.mergeAvailable, false);
  const refused = await send({ kind: "split", section: 0, paragraph: 1, atUnit: 1 });
  assert.equal(refused.error, "Hwp5StructureAbiUnavailable"); assert.equal(refused.applied, false);
  const mergeRefused = await send({ kind: "merge", section: 0, paragraph: 1 });
  assert.equal(mergeRefused.error, "Hwp5StructureAbiUnavailable"); assert.equal(mergeRefused.applied, false);
  assert.equal((await send({ kind: "splice", section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "기존" })).error, undefined);
});

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
