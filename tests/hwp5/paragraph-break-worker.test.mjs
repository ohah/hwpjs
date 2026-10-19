import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { inspect, paragraphRecords } from "./style-preservation/text-record-oracle.mjs";
import { expectedSplitSection } from "./style-preservation/structure-record-oracle.mjs";
import { withoutNormalizationExport } from "./normalization-export-fixture.mjs";

const candidate = process.env.HWPJS_TEST_WASM ? readFileSync(process.env.HWPJS_TEST_WASM) : null;
let sequence = 0;
async function harness(t, wasm) {
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch;
  const replies = [];
  globalThis.self = { postMessage(value) { replies.push(value); } };
  globalThis.fetch = async () => new Response(wasm);
  t.after(() => { globalThis.fetch = previousFetch; if (previousSelf === undefined) delete globalThis.self; else globalThis.self = previousSelf; });
  await import(`../../web/preview/reader-worker.mjs?flow-break=${Date.now()}-${sequence++}`);
  return async message => { await self.onmessage({ data: message }); assert.equal(replies.length, 1); return replies.shift(); };
}
const fixture = format => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`);
async function savedBytes(send, format) {
  const response = await send({ kind: "save", allowStaleLayout: format === "hwp5" });
  assert.equal(response.error, undefined);
  assert(response.bytes instanceof Uint8Array);
  return response.bytes;
}
function verify(input, saved, format, kind) {
  if (format === "hwp5") {
    const before = inspect(input), after = inspect(saved);
    const expected = expectedSplitSection(before.sections, 0, 1, 0), right = paragraphRecords(expected, 2).head;
    expected[right.start + right.raw.length - right.payload.length + 11] = kind === "page" ? 4 : 8;
    assert.deepEqual(after.sections[0].bytes, expected);
    assert.deepEqual(after.metadata, before.metadata);
    for (const [path, bytes] of before.streams) if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), bytes, path);
  } else {
    const payload = JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), kind });
    for (const flags of [[], ["-O"]]) assert.equal(execFileSync("python3", [...flags, "tools/hwpx-flow-break-oracle.py"], { input: payload, encoding: "utf8" }).trim(), "verified");
  }
}

for (const format of ["hwp5", "hwpx"]) {
  for (const kind of ["page", "column"]) test(`${format} Worker explicit ${kind} retains units split target source and history`, { skip: !candidate ? "explicit flow-break candidate required" : false }, async t => {
    const send = await harness(t, candidate), input = fixture(format);
    assert.equal((await send({ kind: "load", format, bytes: input })).error, undefined);
    const enabled = await send({ kind: "enable" });
    assert.equal(enabled.error, undefined); assert.equal(enabled.paragraphBreakAvailable, true);
    const paragraph = format === "hwp5" ? 1 : 0;
    const split = await send({ kind: "split", origin: "canvas", section: 0, paragraph, atUnit: 0, breakBefore: kind });
    assert.equal(split.error, undefined);
    assert.deepEqual(split.splitTarget, { section: 0, paragraph: paragraph + 1 });
    const saved = await savedBytes(send, format);
    verify(input, saved, format, kind);
    assert.equal((await send({ kind: "undo" })).changed, true);
    assert.deepEqual(Buffer.from(await savedBytes(send, format)), input);
    assert.equal((await send({ kind: "redo" })).changed, true);
    assert.deepEqual(await savedBytes(send, format), saved);
    const reopened = await send({ kind: "load", format, bytes: saved }); assert.equal(reopened.error, undefined);
    assert.deepEqual(reopened.content.paragraphs.map(row => row.text), split.content.paragraphs.map(row => row.text));
  });

  test(`${format} Worker rejects malformed break intent before consuming pending redo`, { skip: !candidate ? "explicit flow-break candidate required" : false }, async t => {
    const send = await harness(t, candidate), input = fixture(format), paragraph = format === "hwp5" ? 1 : 0;
    await send({ kind: "load", format, bytes: input }); await send({ kind: "enable" });
    assert.equal((await send({ kind: "split", section: 0, paragraph, atUnit: 0, breakBefore: "page" })).error, undefined);
    const saved = await savedBytes(send, format);
    assert.equal((await send({ kind: "undo" })).changed, true);
    for (const extra of [{ breakBefore: undefined }, { breakBefore: null }, { breakBefore: "PAGE" }, { breakBefore: "column", anchored: true }, { breakBefore: "page", anchored: "true" }, { breakBefore: "column", kind: "merge" }]) {
      const response = await send({ kind: "split", section: 0, paragraph, atUnit: 0, ...extra });
      assert.match(response.error, /Invalid(ParagraphBreakKind|StructureCommand|AnchorMode)/);
      assert.deepEqual(Buffer.from(await savedBytes(send, format)), input);
    }
    assert.equal((await send({ kind: "redo" })).changed, true);
    assert.deepEqual(await savedBytes(send, format), saved);
  });

  test(`${format} Worker old WASM advertises no flow capability and never plain-splits`, async t => {
    const original = candidate ?? readFileSync("zig-out/bin/hwpjs.wasm"), name = `${format}_edit_split_with_break`;
    const legacy = WebAssembly.Module.exports(new WebAssembly.Module(original)).some(row => row.name === name) ? withoutNormalizationExport(original, name) : original;
    const send = await harness(t, legacy), input = fixture(format);
    await send({ kind: "load", format, bytes: input });
    const enabled = await send({ kind: "enable" });
    assert.equal(enabled.error, undefined); assert.equal(enabled.paragraphBreakAvailable, false);
    const rejected = await send({ kind: "split", section: 0, paragraph: format === "hwp5" ? 1 : 0, atUnit: 0, breakBefore: "page" });
    assert.match(rejected.error, /ParagraphBreakAbiUnavailable/);
    assert.deepEqual(Buffer.from(await savedBytes(send, format)), input);
    assert.equal((await send({ kind: "undo" })).changed, false);
  });
}
