import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createReaderRuntime } from "../../web/preview/reader-runtime.mjs";
assert(process.env.HWPJS_TEST_WASM, "ExplicitDisplayCacheWasmRequired");
const module = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));

test("plain Native revisions remain distinct and cached header agrees with a fresh full projection", async () => {
  const runtime = createReaderRuntime({
    wasmModule: module,
    allowReload: true,
    referenceScope: "display-cache-test",
  });
  try {
    const bytes = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/strikethrough.hwpx");
    await runtime.request({ kind: "load", format: "hwpx", bytes });
    await runtime.request({ kind: "enable" });
    const edit = (i) =>
      runtime.request({
        kind: "splice",
        section: 0,
        paragraph: 0,
        startUnit: i,
        endUnit: i,
        text: "a",
      });
    const first = await edit(0),
      second = await edit(1);
    assert.equal(first.historyRevision, 1);
    assert.equal(second.historyRevision, 2);
    assert.equal(second.content.paragraphs[0].text, "aastrikethrough");
    assert.deepEqual(runtime.outcome(second), { application: "applied", changed: true });
    const noop = await runtime.request({
      kind: "splice",
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 0,
      text: "",
    });
    assert.equal(noop.historyRevision, 2);
    assert.deepEqual(runtime.outcome(noop), { application: "unapplied", changed: false });
    const refreshed = await runtime.request({ kind: "refresh" });
    assert.deepEqual(second.content, refreshed.content);
    second.content.characterShapes.length = 0;
    const third = await edit(2);
    assert(third.content.characterShapes.length > 0);
    assert.equal(third.historyRevision, 3);
    const undo = await runtime.request({ kind: "undo" });
    assert.equal(undo.historyRevision, 2);
    assert.equal(undo.content.paragraphs[0].text, "aastrikethrough");
    const redone = await runtime.request({ kind: "redo" });
    assert.equal(redone.historyRevision, 3);
    assert.equal(redone.content.paragraphs[0].text, "aaastrikethrough");
    const failed = await runtime.request({
      kind: "splice",
      section: 999,
      paragraph: 0,
      startUnit: 0,
      endUnit: 0,
      text: "bad",
    });
    assert(failed.error);
    assert.equal(failed.applied, false);
    assert.deepEqual(runtime.outcome(failed), { application: "unapplied", changed: false });
    const fourth = await edit(3);
    assert.equal(fourth.historyRevision, 4);
    assert.deepEqual(fourth.content, (await runtime.request({ kind: "refresh" })).content);
    await runtime.request({ kind: "load", format: "hwpx", bytes });
    await runtime.request({ kind: "enable" });
    assert.equal((await edit(0)).historyRevision, 1);
  } finally {
    await runtime.dispose();
  }
});
