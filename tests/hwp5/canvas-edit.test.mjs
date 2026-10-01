import test from "node:test";
import assert from "node:assert/strict";
import { layoutContent } from "../../web/preview/layout.mjs";
import { hitText, caretGeometry, selectionRects } from "../../web/preview/text-geometry.mjs";
import { textChange, graphemeUnits, snapUnit } from "../../web/preview/text-input.mjs";
import { displayContent } from "../../web/preview/content.mjs";
import { navigateText } from "../../web/preview/text-navigation.mjs";

const paragraph = (text, extras = {}) => ({ section: 0, paragraph: 1, editable: true, label: "label", text, ...extras });
test("text hit-testing maps wrapped graphemes to exact UTF-16 boundaries", () => {
  const layout = layoutContent({ paragraphs: [paragraph("가😀e\u0301나", { label: "ab" })], limited: false }, 20, () => 10);
  const rows = layout.rows.filter(r => r.kind === "text");
  assert.deepEqual(rows.map(r => [r.startUnit, r.endUnit]), [[0, 3], [3, 6]]);
  assert.equal(hitText(layout, 20, 28 + 8).unit, 0);
  assert.equal(hitText(layout, 40, 28 + 8).unit, 3);
  assert.equal(hitText(layout, 30, 2 * 28 + 8).unit, 5);
  assert.equal(hitText(layout, 20, 8), null); assert.equal(hitText(layout, NaN, 8), null);
  const point = { section: 0, paragraph: 1, unit: 3 };
  assert.equal(caretGeometry(layout, point).row, 2);
  assert.equal(caretGeometry(layout, { ...point, affinity: "backward" }).row, 1);
  const rects = selectionRects(layout, { ...point, unit: 1 }, { ...point, unit: 5 });
  assert.deepEqual(rects.map(r => r.width), [10, 10]);
  assert.deepEqual(selectionRects(layout, point, { ...point, paragraph: 2 }), []);
});
test("clipped text and incomplete row groups never advertise editable coordinates", () => {
  const result = { version: [5, 0, 3, 2], sections: [{ index: 0, paragraphs: [
    { text: "가😀", textPresent: true, parentNodeIndex: null, tokens: [{ type: "control", code: 13 }] },
    { text: "nested", textPresent: true, parentNodeIndex: 0, tokens: [] },
    { text: "control", textPresent: true, parentNodeIndex: null, tokens: [{ type: "control", code: 2 }] },
  ] }] };
  assert.deepEqual(displayContent(result).paragraphs.map(p => p.editable), [true, false, false]);
  assert.equal(displayContent(result, { maxUnits: 2 }).paragraphs[0].editable, false);
  const layout = layoutContent({ paragraphs: [paragraph("abcdef")], limited: false }, 10, () => 10, 3);
  assert(layout.limited); assert(layout.rows.every(r => !r.editable));
});
test("empty paragraphs are hit-testable and dragging cannot cross paragraph ownership", () => {
  const layout = layoutContent({ paragraphs: [paragraph(""), paragraph("next", { paragraph: 2 })], limited: false }, 100, () => 10);
  assert.equal(hitText(layout, 100, 28 + 8).unit, 0);
  assert.equal(hitText(layout, 100, 4 * 28 + 8, { section: 0, paragraph: 1 }).paragraph, 1);
});
test("replacement diffs reconstruct adversarial Unicode without split scalar boundaries", () => {
  const words = ["", "a", "가", "각", "😀", "😁", "e\u0301", "\uFEFF", "👩‍💻", "나😀가", "😀😀"];
  for (const before of words) for (const after of words) {
    const change = textChange(before, after);
    if (!change) { assert.equal(before, after); continue; }
    assert.equal(before.slice(0, change.startUnit) + change.text + before.slice(change.endUnit), after);
    assert(before.slice(0, change.startUnit).isWellFormed()); assert(before.slice(change.endUnit).isWellFormed()); assert(change.text.isWellFormed());
  }
  assert.deepEqual(graphemeUnits("가😀e\u0301"), [0, 1, 3, 5]);
  assert.equal(snapUnit("가😀", 2), 1); assert.equal(snapUnit("가😀", 2, true), 3);
});
test("keyboard movement preserves graphemes, wrapped-line affinity and paragraph ownership", () => {
  const text = "가😀e\u0301나", layout = layoutContent({ paragraphs: [paragraph(text, { label: "ab" })], limited: false }, 20, () => 10);
  const point = unit => ({ section: 0, paragraph: 1, unit });
  assert.equal(navigateText(layout, text, point(1), point(1), "ArrowRight").focus.unit, 3);
  assert.equal(navigateText(layout, text, point(3), point(3), "ArrowLeft").focus.unit, 1);
  assert.equal(navigateText(layout, text, point(1), point(5), "ArrowLeft").focus.unit, 1);
  const shifted = navigateText(layout, text, point(1), point(3), "ArrowRight", { extend: true });
  assert.equal(shifted.anchor.unit, 1); assert.equal(shifted.focus.unit, 5);
  const end = navigateText(layout, text, point(1), point(1), "End");
  assert.equal(end.focus.unit, 3); assert.equal(caretGeometry(layout, end.focus).row, 1);
  assert.equal(navigateText(layout, text, point(1), point(1), "ArrowDown").focus.unit, 5);
  assert.equal(navigateText(layout, text, point(1), point(1), "End", { paragraphEdge: true }).focus.unit, text.length);
});
