import { test } from "node:test";
import assert from "node:assert/strict";
import { displayContent, clipText } from "../../web/preview/content.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
import { retainedTextView, sourceTextChange } from "../../web/preview/text-offsets.mjs";
const result = text => ({ version: [5, 0, 3, 2], sections: [{ index: 0, paragraphs: [{ text, textPresent: true, parentNodeIndex: null, tokens: [] }] }] });
test("display projection reports clipping and does not split a surrogate", () => {
  const original = result("가😀나"), copy = structuredClone(original);
  const content = displayContent(original, { maxUnits: 2 });
  assert.equal(content.paragraphs[0].text, "가"); assert(content.limited);
  assert.deepEqual(original, copy);
  assert.equal(clipText("a😀b", 2), "a");
});
test("grapheme wrapping preserves emoji combining marks and empty paragraphs", () => {
  const text = "가😀e\u0301나", content = displayContent(result(text));
  const layout = layoutContent(content, 1, () => 1);
  assert.deepEqual(layout.rows.filter(r => r.kind === "text").map(r => r.text), ["가", "😀", "e\u0301", "나"]);
  assert.equal(layoutContent(displayContent(result("")), 10, () => 1).rows.find(r => r.kind === "text").text, "");
  assert.equal(layout.rows.filter(r => r.kind === "text").map(r => r.text).join(""), text);
});
test("bounded rows and paragraph projection explicitly report omissions", () => {
  assert(layoutContent(displayContent(result("abc")), 1, () => 1, 2).limited);
  assert(displayContent(result("abc"), { maxParagraphs: 0 }).limited);
  assert.throws(() => layoutContent(displayContent(result("a")), 0, () => 1), /InvalidLayoutBounds/);
  assert.throws(() => layoutContent(displayContent(result("a")), 1, () => NaN), /InvalidTextMeasurement/);
});
test("omitted empty text is a display candidate, but missing nonempty text is not", () => {
  const r = result("");
  r.sections[0].paragraphs = [0, 1, 2].map(declaredUnits => ({ text: "", textPresent: false, parentNodeIndex: 1, declaredUnits, tokens: [] }));
  const content = displayContent(r);
  assert.deepEqual(content.paragraphs.map(p => p.editable), [true, true, false]);
  assert.deepEqual(content.paragraphs.map(p => p.text), ["", "", "[직접 텍스트 없음]"]);
});

test("tab display offsets retain emoji units, multiple control widths and clipping isolation", () => {
  const token = (startUnit, text) => ({ type: "text", startUnit, text, raw: Uint8Array.from(Buffer.from(text, "utf16le")) });
  const control = (startUnit, code, bytes) => ({ type: "control", startUnit, code, raw: new Uint8Array(bytes) });
  const p = { text: "😀A", textPresent: true, parentNodeIndex: null, declaredUnits: 20,
    tokens: [token(0, "😀"), control(2, 9, 16), token(10, "A"), control(11, 9, 16), control(19, 13, 2)] };
  const before = structuredClone(p), view = retainedTextView(p);
  assert.equal(view.text, "😀\tA\t");
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(unit => sourceTextChange({ startUnit: unit, endUnit: unit, text: "X" }, view.offsets).startUnit), [0, 1, 2, 10, 11, 19]);
  const r = { version: [5, 0, 3, 2], sections: [{ index: 0, paragraphs: [p] }] };
  const full = displayContent(r).paragraphs[0]; assert(full.editable); assert.deepEqual(full.sourceOffsets, view.offsets);
  const clipped = displayContent(r, { maxUnits: 3 }); assert(clipped.limited); assert.equal(clipped.paragraphs[0].editable, false);
  assert.equal(clipped.paragraphs[0].sourceOffsets, undefined); assert.deepEqual(p, before);
  const layout = layoutContent({ paragraphs: [full], limited: false }, 100, text => text.length);
  assert.equal(layout.rows.find(r => r.kind === "text").boundaries.find(b => b.unit === 3).x, 6);
  assert.equal(retainedTextView({ ...p, declaredUnits: 19 }), null);
  const anchors = retainedTextView({ ...p, tokens: p.tokens.map(t => t.code === 9 ? { ...t, code: 11 } : t) });
  assert.equal(anchors.text, "😀\ufffcA\ufffc");
  assert.deepEqual(anchors.offsets, view.offsets);
  assert.equal(retainedTextView({ ...p, tokens: p.tokens.map(t => t.code === 9 ? { ...t, code: 12 } : t) }), null);
});

test("visible field boundaries map independently without zero-width ambiguity", () => {
  const p = { declaredUnits: 20, tokens: [
    { type: "control", startUnit: 0, code: 3, raw: new Uint8Array(16) },
    { type: "text", startUnit: 8, text: "한😀", raw: new Uint8Array(6) },
    { type: "control", startUnit: 11, code: 4, raw: new Uint8Array(16) },
    { type: "control", startUnit: 19, code: 13, raw: new Uint8Array(2) },
  ] };
  const view = retainedTextView(p);
  assert.equal(view.text, "«한😀»");
  assert.deepEqual(sourceTextChange({ startUnit: 1, endUnit: 4, text: "X" }, view.offsets), { startUnit: 8, endUnit: 11, text: "X" });
  assert.deepEqual(sourceTextChange({ startUnit: 4, endUnit: 5, text: "" }, view.offsets), { startUnit: 11, endUnit: 19, text: "" });
});
