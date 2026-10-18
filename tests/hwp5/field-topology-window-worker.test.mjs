import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
assert(process.env.HWPJS_TEST_WASM, "Explicit topology candidate required");

test("actual unresolved field Worker windows stay readonly and preserve source activation and history", async t => {
  const previous = { self: globalThis.self, fetch: globalThis.fetch }, replies = [];
  globalThis.self = { postMessage: value => replies.push(value) };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM));
  const send = async data => { await self.onmessage({ data }); assert.equal(replies.length, 1); return replies.shift(); };
  t.after(async () => {
    try { await send({ kind: "load", format: "test-close", bytes: [] }); }
    finally { globalThis.fetch = previous.fetch; if (previous.self === undefined) delete globalThis.self; else globalThis.self = previous.self; }
  });
  await import(`../../web/preview/reader-worker.mjs?topology-window=${Math.random()}`);
  const path = "reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp", input = readFileSync(path);
  const loaded = await send({ kind: "load", format: "hwp5", bytes: input });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.content.editorSessionAvailable, true);
  assert.equal(loaded.content.readOnly, false);
  assert.equal(loaded.content.retainedClickFieldProtection, true);
  const check = reply => {
    assert.equal(reply.error, undefined);
    assert.equal(reply.content.readOnly, true);
    assert.equal(reply.content.fieldTopologyDiagnostics[0].unresolved.length, 1);
    assert(reply.content.paragraphs.every(row => !row.editable));
    assert(reply.content.paragraphs.some(row => !row.windowContext && row.fieldTopologyError === "UnresolvedFieldMarkers"));
    assert(reply.content.paragraphs.filter(row => row.windowContext).every(row => row.selectable === false));
  };
  check(await send({ kind: "query-window", offset: 52, count: 1 }));
  assert.equal((await send({ kind: "query-edit-window", offset: 52, count: 1 })).error, "EditorNotOpen");
  const enabled = await send({ kind: "enable" });
  assert.equal(enabled.error, undefined);
  const active = await send({ kind: "set-edit-window", offset: 52, count: 1 });
  check(active);
  check(await send({ kind: "query-edit-window", offset: 52, count: 1 }));
  assert.equal((await send({ kind: "splice", section: 0, paragraph: 52, startUnit: 0, endUnit: 0, text: "입력😀" })).error, "UnsupportedCrossParagraphField");
  const after = await send({ kind: "query-edit-window", offset: 52, count: 1 });
  check(after);
  assert.equal(after.historyRevision, enabled.historyRevision);
  assert.deepEqual(after.historyRevisions, active.historyRevisions);
  assert.equal(after.content.window.requestedOffset, 52);
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), input);
  assert.deepEqual(readFileSync(path), input);
});
