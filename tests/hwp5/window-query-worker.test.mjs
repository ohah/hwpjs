import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("HWP5 Worker window queries preserve edit activation and refresh after input history", async t => {
  const oldSelf = globalThis.self, oldFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage: value => replies.push(value) };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  const send = async data => { await self.onmessage({ data }); assert.equal(replies.length, 1); return replies.shift(); };
  t.after(async () => {
    try { await send({ kind: "load", format: "test-close", bytes: [] }); }
    finally { globalThis.fetch = oldFetch; if (oldSelf === undefined) delete globalThis.self; else globalThis.self = oldSelf; }
  });
  await import(`../../web/preview/reader-worker.mjs?window-query=${Math.random()}`);
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  assert.equal((await send({ kind: "load", format: "hwp5", bytes: input })).error, undefined);
  assert.equal((await send({ kind: "query-edit-window", offset: 1, count: 1 })).error, "EditorNotOpen");
  const queried = await send({ kind: "query-window", offset: 1, count: 1 });
  assert.equal(queried.error, undefined);
  const selectedText = reply => reply.content.paragraphs.find(row => !row.windowContext).text;
  assert.equal(queried.content.paragraphs.filter(row => !row.windowContext).length, 1);
  assert.equal(queried.content.paragraphs.find(row => row.windowContext).paragraph, 0);
  assert.deepEqual(queried.content.columnDisplayErrors, []);
  assert.equal(queried.content.columnDisplaySources[0].current_paragraph, 0);
  const original = selectedText(queried);
  const enabled = await send({ kind: "enable" });
  assert.equal(enabled.error, undefined);
  assert.equal((await send({ kind: "query-edit-window", offset: 1, count: 1 })).historyRevision, enabled.historyRevision);
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), input);
  const active = await send({ kind: "set-edit-window", offset: 1, count: 1 });
  assert.equal(active.error, undefined);
  assert.equal(active.content.documentWindowAvailable, true);
  assert.equal(active.historyRevision, enabled.historyRevision);
  assert.equal(active.content.window.requestedOffset, 1);
  const edited = await send({ kind: "splice", section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "Worker😀" });
  assert.equal(edited.error, undefined);
  assert.equal(edited.content.window.requestedOffset, 1);
  assert.equal(edited.content.window.requestedCount, 1);
  const current = await send({ kind: "query-edit-window", offset: 1, count: 1 });
  assert.equal(current.error, undefined);
  assert.equal(current.historyRevision, edited.historyRevision);
  assert.equal(selectedText(current), "Worker😀" + original);
  const saved = await send({ kind: "save", allowStaleLayout: true });
  const repeated = await send({ kind: "query-edit-window", offset: 1, count: 1 });
  assert.deepEqual(repeated.historyRevisions, current.historyRevisions);
  assert.deepEqual((await send({ kind: "save", allowStaleLayout: true })).bytes, saved.bytes);
  assert.equal((await send({ kind: "undo" })).error, undefined);
  assert.equal(selectedText(await send({ kind: "query-edit-window", offset: 1, count: 1 })), original);
  assert.equal((await send({ kind: "query-window", offset: -1, count: 1 })).error, "InvalidParagraphWindow");
  assert.equal((await send({ kind: "set-edit-window", offset: -1, count: 1 })).error, "InvalidParagraphWindow");
  for (const request of [{ offset: NaN, count: 1 }, { offset: 1, count: undefined }, { offset: 0, count: Number.MAX_SAFE_INTEGER }, { offset: "1", count: 1 }]) {
    assert.equal((await send({ kind: "query-window", ...request })).error, "InvalidParagraphWindow");
  }
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), input);
  const redone = await send({ kind: "redo" });
  assert.equal(redone.error, undefined);
  assert.equal(redone.content.window.requestedOffset, 1);
  assert.equal(selectedText(await send({ kind: "query-edit-window", offset: 1, count: 1 })), "Worker😀" + original);
  const restored = await send({ kind: "set-edit-window", offset: null, count: null });
  assert.equal(restored.error, undefined);
  assert.equal(restored.content.window, undefined);
  assert.equal(restored.historyRevision, redone.historyRevision);
  for (const [name, offset] of [["table-caption", 1], ["textbox", 1], ["sample-5017-pics", 0], ["issue144-fields-crossing-lineseg-boundary", 2]]) {
    const full = await send({ kind: "load", format: "hwp5", bytes: readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`) });
    assert.equal(full.error, undefined);
    const window = await send({ kind: "query-window", offset, count: 1 });
    assert.equal(window.error, undefined, name);
    assert.equal(window.content.paragraphs.filter(row => !row.windowContext).length, 1);
    assert.equal(window.content.paragraphs.find(row => !row.windowContext).windowOrdinal, offset);
    assert.equal(new Set(window.content.paragraphs.map(row => row.windowOrdinal)).size, window.content.paragraphs.length);
    assert(window.content.paragraphs.filter(row => row.windowContext).every(row => !row.editable && !row.selectable));
    for (const key of ["tableAnchorErrors", "hwp5DrawingErrors", "hwp5DrawingBodyErrors", "hwp5CaptionErrors", "hwp5PictureErrors"]) assert.deepEqual(window.content[key], [], `${name}:${key}`);
    if (name === "sample-5017-pics") {
      assert.equal(window.content.hwp5PictureGeometryError, undefined);
      assert.equal(window.content.pictures.length, 1);
      assert.deepEqual(window.content.pictures[0], full.content.pictures.find(row => row.pictureNode === window.content.pictures[0].pictureNode));
    }
    assert.equal((await send({ kind: "query-edit-window", offset, count: 1 })).error, "EditorNotOpen");
    const enabled = await send({ kind: "enable" });
    assert.equal(enabled.error, undefined);
    assert.equal((await send({ kind: "query-edit-window", offset, count: 1 })).historyRevision, enabled.historyRevision);
    assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`));
  }
});
