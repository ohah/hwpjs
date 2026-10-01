import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { displayHwpxContent } from "../../web/preview/hwpx-content.mjs";

const event = (paragraph, kind, value = "", inlineKind = null) => ({ section: 0, paragraph, kind, value, inlineKind });
const sample = { paragraphCount: 2, events: [event(1, "paragraph_start"), event(1, "content", "A😀"), event(2, "paragraph_start"), event(2, "content", "아이"), event(2, "inline_empty", "", "tab"), event(2, "paragraph_end"), event(1, "content", "B"), event(1, "paragraph_end")] };

test("HWPX display retains nested ownership and is never advertised as editable", () => {
  const before = JSON.stringify(sample), result = displayHwpxContent(sample);
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.paragraphs.map(p => p.text), ["A😀B", "아이\t"]);
  assert(result.paragraphs[1].label.includes("중첩"));
  assert(result.paragraphs.every(p => !p.editable));
  assert.equal(JSON.stringify(sample), before);
});

test("HWPX display clips a contiguous prefix without split surrogate or later chunk holes", () => {
  const clipped = displayHwpxContent(sample, { maxUnits: 2 });
  assert.equal(clipped.limited, true);
  assert.deepEqual(clipped.paragraphs.map(p => p.text), ["A", ""]);
  assert(clipped.paragraphs.every(p => p.clipped === true));
  assert(displayHwpxContent(sample).paragraphs.every(p => !p.clipped));
  assert.equal(displayHwpxContent(sample, { maxParagraphs: 0 }).paragraphs.length, 0);
  assert.throws(() => displayHwpxContent(sample, { maxUnits: -1 }), { message: "InvalidDisplayBounds" });
  for (const events of [[event(1, "paragraph_end")], [event(1, "paragraph_start"), event(2, "content", "x")], [event(1, "paragraph_start")], [event(1, "paragraph_start"), event(1, "paragraph_start")]])
    assert.throws(() => displayHwpxContent({ paragraphCount: 1, events }), { message: "InvalidHwpxParagraphEvents" });
});

test("every tracked readable HWPX has a bounded read-only Canvas projection", async () => {
  const reader = await createHwpxReader(readFileSync("zig-out/bin/hwpjs.wasm"));
  try {
    const files = execFileSync("git", ["ls-files", "-z"]).toString().split("\0").filter(p => p.includes("/fixtures/") && p.endsWith(".hwpx") && !p.endsWith("/password-12345.hwpx"));
    assert(files.length);
    for (const path of files) {
      const events = reader.readTextEvents(readFileSync(path)), content = displayHwpxContent(events);
      assert.equal(content.totalParagraphs, events.paragraphCount, path);
      assert.equal(content.paragraphs.length, events.paragraphCount, path);
      assert.equal(content.limited, false, path);
      assert(content.paragraphs.every(p => !p.editable), path);
    }
  } finally { reader.close(); }
});

test("actual HWPX Worker edits native plain text and refuses unsupported controls", async t => {
  const originalSelf = globalThis.self, originalFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage(message) { replies.push(message); } };
  globalThis.fetch = async () => new Response(readFileSync("zig-out/bin/hwpjs.wasm"));
  t.after(() => { globalThis.fetch = originalFetch; if (originalSelf === undefined) delete globalThis.self; else globalThis.self = originalSelf; });
  await import(`../../web/preview/reader-worker.mjs?hwpx-regression=${Date.now()}`);
  const send = async message => { await self.onmessage({ data: message }); const reply = replies.shift(); assert(reply); assert.equal(replies.length, 0); return reply; };
  const loaded = await send({ kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx") });
  assert.equal(loaded.error, undefined); assert.equal(loaded.content.totalParagraphs, 7);
  assert.equal(loaded.content.paragraphs[0].editable, true);
  assert.equal(loaded.content.paragraphs[1].editable, true);
  assert.equal(loaded.content.readOnly, false);
  assert.equal((await send({ kind: "enable" })).error, undefined);
  const edited = await send({ kind: "splice", section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "검증😀" });
  assert.equal(edited.error, undefined);
  assert(edited.content.paragraphs[1].text.startsWith("검증😀"));
  const format = await send({ kind: "format" });
  assert.equal(format.error, "UnsupportedHwpxFormatting"); assert.equal(format.applied, false);
  const restored = await send({ kind: "splice", section: 0, paragraph: 1, startUnit: 0, endUnit: 4, text: "" });
  assert.equal(restored.error, undefined);
  assert.equal(restored.content.paragraphs[1].text, loaded.content.paragraphs[1].text);
  const notes = await send({ kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx") });
  assert.equal(notes.error, undefined);
  assert.equal(notes.content.paragraphs[0].editable, false);
  const refused = await send({ kind: "splice", section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: "안됨" });
  assert.equal(refused.error, "UnsupportedParagraphControl"); assert.equal(refused.applied, false);
});
