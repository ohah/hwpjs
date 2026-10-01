import { test } from "node:test";
import assert from "node:assert/strict";
import { displayContent, clipText } from "../../web/preview/content.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
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
