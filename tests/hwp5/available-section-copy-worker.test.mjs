import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { sectionCountFixtures } from "./section-count-fixtures.mjs";
import { withoutNormalizationExport } from "./normalization-export-fixture.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit copy API candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
let identity = 0;
async function worker(t, binary = wasm) {
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage(value) { replies.push(value); } };
  globalThis.fetch = async () => new Response(binary);
  t.after(() => { globalThis.fetch = previousFetch; if (previousSelf === undefined) delete globalThis.self; else globalThis.self = previousSelf; });
  await import(`../../web/preview/reader-worker.mjs?copy=${++identity}`);
  return async message => { await self.onmessage({ data: message }); assert.equal(replies.length, 1); return replies.shift(); };
}

for (const [name, , declared, available] of sectionCountFixtures) test(`Worker explicit section copy owns edit save undo redo: ${name}`, async t => {
  const path = `reference/rhwp/samples/${name}`;
  if (!existsSync(path)) { t.skip("Reference fixture unavailable"); return; }
  const bytes = readFileSync(path), send = await worker(t);
  const failed = await send({ kind: "load", bytes });
  assert.equal(failed.error, "SectionCountMismatch");
  assert.equal(failed.availableSectionCopyAvailable, true);
  const loaded = await send({ kind: "load", bytes, availableSectionCopy: true });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.content.normalizationInfo.historyBaseline, "available-sections-copy");
  assert.deepEqual(loaded.content.normalizationInfo.sectionInventory, { declared, available, mismatch: true });
  assert.equal(loaded.content.availableSectionsOnly, undefined);
  assert.equal((await send({ kind: "save", allowStaleLayout: true })).error, "EditorNotOpen");
  assert.equal((await send({ kind: "enable" })).error, undefined);
  const baseline = await send({ kind: "save", allowStaleLayout: true });
  assert.equal(baseline.error, undefined);
  const offsets = [[8], [8, 16], [24]][sectionCountFixtures.findIndex(row => row[0] === name)];
  for (let section = 0; section < available; section++) {
    const edited = await send({ kind: "splice", section, paragraph: 0, startUnit: offsets[section], endUnit: offsets[section], text: "Worker사본😀" });
    assert.equal(edited.error, undefined);
    assert(Number.isInteger(edited.historyRevision) && edited.historyRevision > 0);
    assert.equal(edited.content.normalizationInfo.historyBaseline, "available-sections-copy");
  }
  const changed = await send({ kind: "save", allowStaleLayout: true });
  assert.equal(changed.error, undefined);
  assert.notDeepEqual(changed.bytes, baseline.bytes);
  for (let section = 0; section < available; section++) assert.equal((await send({ kind: "undo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save", allowStaleLayout: true })).bytes, baseline.bytes);
  for (let section = 0; section < available; section++) assert.equal((await send({ kind: "redo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save", allowStaleLayout: true })).bytes, changed.bytes);
  assert.deepEqual(readFileSync(path), bytes);
});

test("invalid copy requests preserve current editor and its redo", async t => {
  const send = await worker(t), bytes = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  assert.equal((await send({ kind: "load", bytes })).error, undefined);
  assert.equal((await send({ kind: "enable" })).error, undefined);
  assert.equal((await send({ kind: "splice", section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "retained" })).error, undefined);
  const saved = await send({ kind: "save", allowStaleLayout: true });
  const undone = await send({ kind: "undo" });
  for (const options of [{ availableSectionCopy: null }, { availableSectionCopy: "true" }, { availableSectionCopy: 1 }, { availableSectionCopy: true, format: "hwpx" }, { availableSectionCopy: true, availableSectionsOnly: true }, { availableSectionCopy: true, normalizeObservedCfb: true }, { availableSectionCopy: true, distribution: true }]) {
    const result = await send({ kind: "load", bytes, ...options });
    assert(result.error);
    assert.equal(result.historyRevision, undone.historyRevision);
    assert.deepEqual(result.historyRevisions, undone.historyRevisions);
  }
  assert.equal((await send({ kind: "redo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save", allowStaleLayout: true })).bytes, saved.bytes);
});

for (const name of ["hwp5_edit_open_available_section_copy", "hwp5_edit_available_section_copy_info"]) test(`Worker copy capability requires optional export ${name}`, async t => {
  const path = `reference/rhwp/samples/${sectionCountFixtures[0][0]}`;
  if (!existsSync(path)) { t.skip("Reference fixture unavailable"); return; }
    const send = await worker(t, withoutNormalizationExport(wasm, name)), bytes = readFileSync(path);
    const failed = await send({ kind: "load", bytes });
    assert.equal(failed.error, "SectionCountMismatch");
    assert.equal(failed.availableSectionCopyAvailable, undefined);
    assert.equal(failed.availableSectionsPreviewAvailable, true);
    const explicit = await send({ kind: "load", bytes, availableSectionCopy: true });
    assert.equal(explicit.error, "Hwp5AvailableSectionCopyAbiUnavailable");
    assert.equal(explicit.availableSectionCopyAvailable, undefined);
});
