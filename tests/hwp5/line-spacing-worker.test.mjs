import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paragraphLineAdvance, paragraphSpacing } from "../../web/preview/paragraph-geometry.mjs";

test("HWP5 Worker zero percentage shares effective display values through undo redo and rejection", async (t) => {
  const oldSelf = globalThis.self,
    oldFetch = globalThis.fetch,
    replies = [];
  globalThis.self = { postMessage: (value) => replies.push(value) };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldSelf === undefined) delete globalThis.self;
    else globalThis.self = oldSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?line-spacing=${Date.now()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp");
  assert.equal((await send({ kind: "load", bytes: input })).error, undefined);
  const original = await send({ kind: "enable" });
  const selected = (content) =>
    content.paragraphs.find((p) => p.section === 0 && p.paragraph === 5);
  const before = paragraphSpacing(selected(original.content).paragraphShape);
  const command = {
    kind: "paragraph-spacing",
    origin: "canvas",
    section: 0,
    paragraph: 5,
    type: "PERCENT",
    value: 0,
  };
  const changed = await send(command);
  assert.equal(changed.error, undefined);
  const shape = selected(changed.content).paragraphShape;
  assert.equal(shape.modernSpacing.value, 0);
  assert.equal(shape.legacySpacing, 0);
  assert.equal(paragraphLineAdvance(shape, 20, 28), 0);
  assert.deepEqual(
    changed.content.paragraphs.map((p) => p.text),
    original.content.paragraphs.map((p) => p.text),
  );
  const undone = await send({ kind: "undo" });
  assert.equal(undone.error, undefined);
  assert.deepEqual(paragraphSpacing(selected(undone.content).paragraphShape), before);
  assert.equal((await send({ ...command, type: "FUTURE" })).error, "InvalidParagraphSpacing");
  const redone = await send({ kind: "redo" });
  assert.equal(redone.error, undefined);
  assert.deepEqual(paragraphSpacing(selected(redone.content).paragraphShape), {
    kind: 0,
    value: 0,
  });
  assert.deepEqual(
    redone.content.paragraphs.map((p) => p.text),
    original.content.paragraphs.map((p) => p.text),
  );
});
