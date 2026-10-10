import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("actual Worker window queries preserve native source and edit history on success and failure", async t => {
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage: value => replies.push(value) };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete globalThis.self; else globalThis.self = previousSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?window-query=${Date.now()}`);
  const send = async data => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  assert.equal((await send({ kind: "query-window", offset: 0, count: 1 })).error, "EditorNotOpen");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx");
  const loaded = await send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  assert.equal((await send({ kind: "query-edit-window", offset: 0, count: 1 })).error, "EditorNotOpen");
  const enabled = await send({ kind: "enable" });
  assert.equal(enabled.error, undefined);
  const row = enabled.content.paragraphs.find(p => p.plainEditable && !p.text.includes("\t"));
  assert.ok(row);
  const changed = await send({ kind: "splice", section: row.section, paragraph: row.paragraph, startUnit: 0, endUnit: 0, text: "구간😀" });
  assert.equal(changed.error, undefined);
  const saved = (await send({ kind: "save" })).bytes;
  const query = await send({ kind: "query-window", offset: row.paragraph, count: 1 });
  assert.equal(query.error, undefined);
  assert.equal(query.historyRevision, changed.historyRevision);
  assert.equal(query.content.readOnly, true);
  assert(query.content.paragraphs.every(p => !p.editable));
  assert.equal(query.content.paragraphs.find(p => p.section === row.section && p.paragraph === row.paragraph).text,
    changed.content.paragraphs.find(p => p.section === row.section && p.paragraph === row.paragraph).text);
  const editableWindow = await send({ kind: "query-edit-window", offset: row.paragraph, count: 1 });
  assert.equal(editableWindow.error, undefined);
  assert.equal(editableWindow.historyRevision, changed.historyRevision);
  assert.equal(editableWindow.content.readOnly, false);
  const editableRow = editableWindow.content.paragraphs.find(p => p.section === row.section && p.paragraph === row.paragraph);
  assert.equal(editableRow.plainEditable, true);
  assert.equal(editableRow.editable, true);
  assert.equal(editableRow.text, query.content.paragraphs.find(p => p.section === row.section && p.paragraph === row.paragraph).text);
  assert.deepEqual(editableRow.characterRanges, changed.content.paragraphs.find(p => p.section === row.section && p.paragraph === row.paragraph).characterRanges);
  for (const offset of [-1, 0.5, enabled.content.totalParagraphs + 1]) {
    const refused = await send({ kind: "query-window", offset, count: 1 });
    assert.equal(refused.error, "InvalidParagraphWindow");
    assert.equal(refused.historyRevision, changed.historyRevision);
  }
  assert.deepEqual((await send({ kind: "save" })).bytes, saved);
  assert.equal((await send({ kind: "undo" })).error, undefined);
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), input);
  assert.equal((await send({ kind: "redo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save" })).bytes, saved);
  const split = await send({ kind: "split", section: row.section, paragraph: row.paragraph, atUnit: 1 });
  assert.equal(split.error, undefined);
  assert.ok(split.splitTarget);
  const splitSaved = (await send({ kind: "save" })).bytes;
  const splitWindow = await send({ kind: "query-window", offset: row.paragraph, count: 2 });
  assert.equal(splitWindow.error, undefined);
  assert.equal(splitWindow.historyRevision, split.historyRevision);
  assert.equal(splitWindow.content.totalParagraphs, enabled.content.totalParagraphs + 1);
  for (const paragraph of [row.paragraph, split.splitTarget.paragraph]) {
    assert.equal(splitWindow.content.paragraphs.find(p => p.section === row.section && p.paragraph === paragraph).text,
      split.content.paragraphs.find(p => p.section === row.section && p.paragraph === paragraph).text);
  }
  const merged = await send({ kind: "merge", section: row.section, paragraph: row.paragraph });
  assert.equal(merged.error, undefined);
  const mergedSaved = (await send({ kind: "save" })).bytes;
  const mergedWindow = await send({ kind: "query-window", offset: row.paragraph, count: 1 });
  assert.equal(mergedWindow.error, undefined);
  assert.equal(mergedWindow.content.totalParagraphs, enabled.content.totalParagraphs);
  assert.equal(mergedWindow.content.paragraphs.find(p => p.section === row.section && p.paragraph === row.paragraph).text,
    query.content.paragraphs.find(p => p.section === row.section && p.paragraph === row.paragraph).text);
  assert.equal((await send({ kind: "undo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save" })).bytes, splitSaved);
  assert.equal((await send({ kind: "redo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save" })).bytes, mergedSaved);
  const activated = await send({ kind: "set-edit-window", offset: row.paragraph, count: 1 });
  assert.equal(activated.error, undefined);
  assert.equal(activated.content.window.requestedOffset, row.paragraph);
  const typed = await send({ kind: "splice", section: row.section, paragraph: row.paragraph, startUnit: 0, endUnit: 0, text: "창" });
  assert.equal(typed.error, undefined);
  assert.equal(typed.content.window.requestedOffset, row.paragraph);
  const typedSaved = (await send({ kind: "save" })).bytes;
  const refused = await send({ kind: "set-edit-window", offset: -1, count: 1 });
  assert.equal(refused.error, "InvalidParagraphWindow");
  assert.deepEqual((await send({ kind: "save" })).bytes, typedSaved);
  const undone = await send({ kind: "undo" });
  assert.equal(undone.error, undefined);
  assert.equal(undone.content.window.requestedOffset, row.paragraph);
  assert.deepEqual((await send({ kind: "save" })).bytes, mergedSaved);
  const redone = await send({ kind: "redo" });
  assert.equal(redone.error, undefined);
  assert.equal(redone.content.window.requestedOffset, row.paragraph);
  assert.deepEqual((await send({ kind: "save" })).bytes, typedSaved);
  const restored = await send({ kind: "set-edit-window", offset: null, count: null });
  assert.equal(restored.error, undefined);
  assert.equal(restored.content.window, undefined);
  assert.equal(restored.historyRevision, redone.historyRevision);
  assert.deepEqual((await send({ kind: "save" })).bytes, typedSaved);
});
