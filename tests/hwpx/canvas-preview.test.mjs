import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { displayHwpxContent } from "../../web/preview/hwpx-content.mjs";
import { displayRunText } from "../../web/preview/layout.mjs";

const event = (paragraph, kind, value = "", inlineKind = null) => ({ section: 0, paragraph, kind, value, inlineKind });
const sample = { paragraphCount: 2, events: [event(1, "paragraph_start"), event(1, "content", "A😀"), event(2, "paragraph_start"), event(2, "content", "아이"), event(2, "inline_empty", "", "tab"), event(2, "paragraph_end"), event(1, "content", "B"), event(1, "paragraph_end")] };

test("protected object positions have a visible Canvas spelling without changing source text", () => {
  const source = "A\ufffc\ufffcB😀";
  assert.equal(displayRunText(source), "A◇◇B😀");
  assert.equal(displayRunText(source).length, source.length);
});

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
  assert.equal((await send({ kind: "undo" })).error, "HistoryNotEnabled");
  assert.equal((await send({ kind: "enable" })).error, undefined);
  assert.equal((await send({ kind: "enable" })).historyAvailable, true);
  assert.equal((await send({ kind: "undo" })).changed, false);
  const edited = await send({ kind: "splice", section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "검증😀" });
  assert.equal(edited.error, undefined);
  assert(edited.content.paragraphs[1].text.startsWith("검증😀"));
  const saved = await send({ kind: "save" });
  assert.equal(saved.error, undefined);
  assert.equal(saved.format, "hwpx");
  assert.equal(saved.layoutRequiresReflow, true);
  const undone = await send({ kind: "undo" });
  assert.equal(undone.changed, true);
  assert.deepEqual(undone.content, loaded.content);
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx"));
  assert.equal((await send({ kind: "format" })).error, "UnsupportedHwpxFormatting");
  const redone = await send({ kind: "redo" });
  assert.equal(redone.changed, true);
  assert.deepEqual(redone.content, edited.content);
  assert.deepEqual((await send({ kind: "save" })).bytes, saved.bytes);
  const savedReader = await createHwpxReader(readFileSync("zig-out/bin/hwpjs.wasm"));
  try { assert(savedReader.readTextEvents(saved.bytes).events.some(e => e.kind === "content" && e.value.startsWith("검증😀"))); }
  finally { savedReader.close(); }
  const refusedSave = await send({ kind: "save", allowStaleLayout: null });
  assert.equal(refusedSave.error, "InvalidStaleLayoutPolicy");
  assert.equal(refusedSave.applied, false);
  assert.deepEqual((await send({ kind: "save" })).bytes, saved.bytes);
  const format = await send({ kind: "format" });
  assert.equal(format.error, "UnsupportedHwpxFormatting"); assert.equal(format.applied, false);
  const restored = await send({ kind: "splice", section: 0, paragraph: 1, startUnit: 0, endUnit: 4, text: "" });
  assert.equal(restored.error, undefined);
  assert.equal(restored.content.paragraphs[1].text, loaded.content.paragraphs[1].text);
  const notes = await send({ kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx") });
  assert.equal(notes.error, undefined);
  assert.equal((await send({ kind: "redo" })).error, "HistoryNotEnabled");
  assert.equal(notes.content.paragraphs[0].editable, true);
  assert.equal(notes.content.paragraphs[0].anchorEditable, true);
  assert.equal(notes.content.paragraphs[0].text, "각주참조\ufffc\ufffc");
  const refused = await send({ kind: "splice", section: 0, paragraph: 0, startUnit: 4, endUnit: 5, text: "" });
  assert.equal(refused.error, "ProtectedInlineControl"); assert.equal(refused.applied, false);
  const noteEdited = await send({ kind: "splice", section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: "앞😀" });
  assert.equal(noteEdited.error, undefined);
  assert.equal(noteEdited.content.paragraphs[0].text, "앞😀각주참조\ufffc\ufffc");
  const captions = await send({ kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwpx") });
  assert.equal(captions.error, undefined);
  const caption = captions.content.paragraphs.find(p => p.text === "표 \ufffc 위 캡션");
  assert(caption?.anchorEditable); assert.equal(caption.editable, true);
  const numberDeletion = await send({ kind: "splice", section: caption.section, paragraph: caption.paragraph, startUnit: 2, endUnit: 3, text: "" });
  assert.equal(numberDeletion.error, "ProtectedInlineControl"); assert.equal(numberDeletion.applied, false);
  const captionEdited = await send({ kind: "splice", section: caption.section, paragraph: caption.paragraph, startUnit: 3, endUnit: 3, text: "검증😀" });
  assert.equal(captionEdited.error, undefined);
  assert.equal(captionEdited.content.paragraphs.find(p => p.paragraph === caption.paragraph).text, "표 \ufffc검증😀 위 캡션");
  for (const [name, ordinal] of [["noori", 13], ["page", 1], ["table-bug", 1], ["headerfooter", 2]]) {
    const pageSettings = await send({ kind: "load", format: "hwpx", bytes: readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwpx`) });
    assert.equal(pageSettings.error, undefined);
    const target = pageSettings.content.paragraphs[ordinal - 1];
    assert.equal(target.editable, true, name);
    assert.equal(target.text.includes("\ufffc"), false, name);
    const changed = await send({ kind: "splice", section: target.section, paragraph: target.paragraph, startUnit: 0, endUnit: 0, text: "검증😀" });
    assert.equal(changed.error, undefined, name);
    assert.equal(changed.content.paragraphs[ordinal - 1].text, "검증😀" + target.text, name);
    const reverted = await send({ kind: "splice", section: target.section, paragraph: target.paragraph, startUnit: 0, endUnit: 4, text: "" });
    assert.equal(reverted.error, undefined, name);
    assert.equal(reverted.content.paragraphs[ordinal - 1].text, target.text, name);
  }
  const hyperlink = await send({ kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx") });
  assert.equal(hyperlink.error, undefined);
  const labelParagraph = hyperlink.content.paragraphs.find(p => p.fieldLabels.length > 0);
  assert(labelParagraph); assert.equal(labelParagraph.editable, true); assert.equal(labelParagraph.plainEditable, false);
  const target = labelParagraph.fieldLabels[0];
  assert.equal((await send({ kind: "enable" })).historyAvailable, true);
  const labelEdited = await send({ kind: "splice", section: labelParagraph.section, paragraph: labelParagraph.paragraph, startUnit: target.start, endUnit: target.start, text: "검증😀" });
  assert.equal(labelEdited.error, undefined);
  const current = labelEdited.content.paragraphs.find(p => p.paragraph === labelParagraph.paragraph);
  assert.equal(current.text, labelParagraph.text.slice(0, target.start) + "검증😀" + labelParagraph.text.slice(target.start));
  assert.equal(current.fieldLabels[0].end, target.end + 4);
  const labelUndo = await send({ kind: "undo" });
  assert.equal(labelUndo.changed, true);
  assert.deepEqual(labelUndo.content, hyperlink.content);
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx"));
  const labelRedo = await send({ kind: "redo" });
  assert.equal(labelRedo.changed, true);
  assert.deepEqual(labelRedo.content, labelEdited.content);
  const outside = await send({ kind: "splice", section: current.section, paragraph: current.paragraph, startUnit: current.fieldLabels.at(-1).end + 1, endUnit: current.fieldLabels.at(-1).end + 1, text: "안됨" });
  assert.equal(outside.error, "UnsupportedFieldLabelRange"); assert.equal(outside.applied, false);
  const labelRestored = await send({ kind: "splice", section: current.section, paragraph: current.paragraph, startUnit: target.start, endUnit: target.start + 4, text: "" });
  assert.equal(labelRestored.error, undefined);
  assert.equal(labelRestored.content.paragraphs.find(p => p.paragraph === current.paragraph).text, labelParagraph.text);
  const chart = await send({ kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx") });
  assert.equal(chart.error, undefined);
  const numeric = chart.content.paragraphs.find(p => p.text === "11.2");
  const formula = chart.content.paragraphs.find(p => p.text === "67.5");
  assert(numeric?.editable); assert(formula); assert.equal(formula.editable, false);
  assert.equal((await send({ kind: "enable" })).historyAvailable, true);
  const calculated = await send({ kind: "splice", section: numeric.section, paragraph: numeric.paragraph, startUnit: 0, endUnit: 4, text: "100" });
  assert.equal(calculated.error, undefined);
  assert.equal(calculated.content.paragraphs.find(p => p.paragraph === formula.paragraph).text, "156.3");
  const calculationUndo = await send({ kind: "undo" });
  assert.equal(calculationUndo.changed, true);
  assert.deepEqual(calculationUndo.content, chart.content);
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx"));
  const calculationRedo = await send({ kind: "redo" });
  assert.equal(calculationRedo.changed, true);
  assert.deepEqual(calculationRedo.content, calculated.content);
  const invalidNumber = await send({ kind: "splice", section: numeric.section, paragraph: numeric.paragraph, startUnit: 0, endUnit: 3, text: "bad" });
  assert.equal(invalidNumber.error, "InvalidFormulaNumber"); assert.equal(invalidNumber.applied, false);
  const numericRestored = await send({ kind: "splice", section: numeric.section, paragraph: numeric.paragraph, startUnit: 0, endUnit: 3, text: "11.2" });
  assert.equal(numericRestored.error, undefined);
  assert.equal(numericRestored.content.paragraphs.find(p => p.paragraph === formula.paragraph).text, "67.5");
  const corpus = execFileSync("git", ["ls-files", "-z"]).toString().split("\0").filter(path => path.includes("/fixtures/") && path.endsWith(".hwpx"));
  let readable = 0, encrypted = 0, fieldCount = 0;
  for (const path of corpus) {
    const original = readFileSync(path);
    const result = await send({ kind: "load", format: "hwpx", bytes: original });
    if (path.endsWith("/password-12345.hwpx")) {
      assert.equal(result.error, "EncryptedDocument"); encrypted++;
      assert.equal((await send({ kind: "save" })).error, "EditorNotOpen");
    } else {
      assert.equal(result.error, undefined, path); readable++;
      const saved = await send({ kind: "save" });
      assert.equal(saved.error, undefined, path);
      assert.deepEqual(Buffer.from(saved.bytes), original, path);
      fieldCount += result.content.paragraphs.reduce((sum, p) => sum + p.fieldLabels.length, 0);
    }
  }
  assert.equal(readable, 44); assert.equal(encrypted, 1); assert.equal(fieldCount, 7);
});
