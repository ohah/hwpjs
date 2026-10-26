import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, verifyRaw } from "./style-preservation/text-record-oracle.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit window candidate required");

test("actual 53448-paragraph HWP5 edits beyond the default window and preserves complete source history", async (t) => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  const path =
    "reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp";
  const input = readFileSync(path),
    oldSelf = globalThis.self,
    oldFetch = globalThis.fetch,
    replies = [];
  globalThis.self = { postMessage: (reply) => replies.push(reply) };
  globalThis.fetch = async () => new Response(wasm);
  const send = async (message) => {
    const started = performance.now();
    await self.onmessage({ data: message });
    console.log(
      JSON.stringify({
        kind: "late-window-stage",
        request: message.kind,
        durationMs: performance.now() - started,
      }),
    );
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  t.after(async () => {
    try {
      await send({ kind: "load", format: "test-close", bytes: [] });
    } finally {
      globalThis.fetch = oldFetch;
      if (oldSelf === undefined) delete globalThis.self;
      else globalThis.self = oldSelf;
    }
  });
  await import("../../web/preview/reader-worker.mjs?actual-late-window");
  const loaded = await send({ kind: "load", format: "hwp5", bytes: input });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.content.totalParagraphs, 53448);
  assert.equal(loaded.content.documentWindowAvailable, true);
  assert(!loaded.content.paragraphs.some((row) => row.windowOrdinal === 50000));
  assert.equal((await send({ kind: "enable" })).error, undefined);
  const active = await send({ kind: "set-edit-window", offset: 50000, count: 1 });
  assert.equal(active.error, undefined);
  const selected = active.content.paragraphs.filter((row) => !row.windowContext);
  assert.equal(selected.length, 1);
  const target = selected[0];
  assert.equal(target.windowOrdinal, 50000);
  assert.notEqual(target.clipped, true);
  assert(
    !loaded.content.paragraphs.some(
      (row) => row.section === target.section && row.paragraph === target.paragraph,
    ),
  );
  assert.equal(target.editable, true);
  assert(active.content.paragraphs.some((row) => row.windowOrdinal === 35871 && row.windowContext));
  assert(
    active.content.paragraphs
      .filter((row) => row.windowContext)
      .every((row) => !row.editable && !row.selectable),
  );
  const before = (await send({ kind: "save" })).bytes;
  assert.deepEqual(Buffer.from(before), input);
  const marker = "후반구간😀";
  const edited = await send({
    kind: "splice",
    section: target.section,
    paragraph: target.paragraph,
    startUnit: 0,
    endUnit: 0,
    text: marker,
  });
  assert.equal(edited.error, undefined);
  assert.equal(edited.content.window.requestedOffset, 50000);
  const changed = edited.content.paragraphs.find((row) => row.windowOrdinal === 50000);
  assert.equal(changed.text, marker + target.text);
  const saved = (await send({ kind: "save", allowStaleLayout: true })).bytes;
  verifyRaw(before, saved, target.section, target.paragraph, 0, 0, marker);
  assert.deepEqual(inspect(saved).metadata, inspect(before).metadata);
  assert.equal((await send({ kind: "undo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save" })).bytes, before);
  assert.equal(
    (await send({ kind: "set-edit-window", offset: 53448, count: 1 })).error,
    "InvalidParagraphWindow",
  );
  assert.deepEqual((await send({ kind: "save" })).bytes, before);
  assert.equal((await send({ kind: "redo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save", allowStaleLayout: true })).bytes, saved);
  const reopened = await createExperimentalHwp5Editor(wasm, saved);
  try {
    assert.equal(reopened.text(target.section, target.paragraph).startsWith(marker), true);
    assert.deepEqual(Buffer.from(reopened.save().bytes), Buffer.from(saved));
  } finally {
    reopened.close();
  }
  assert.deepEqual(readFileSync(path), input);
});
