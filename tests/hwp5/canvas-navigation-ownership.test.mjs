import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
import { navigateText } from "../../web/preview/text-navigation.mjs";

test("vertical candidate filtering precedes distance choice in both directions", () => {
  const layout = layoutContent({ paragraphs: [1, 2, 3, 4].map(paragraph => ({ section: 0, paragraph, text: "abcd", label: "", editable: true })), limited: false }, 500, () => 8);
  const before = structuredClone(layout);
  for (const [from, to, key] of [[1, 3, "ArrowDown"], [3, 1, "ArrowUp"]]) {
    const point = { section: 0, paragraph: from, unit: 1 };
    const options = { extend: true, crossParagraph: true };
    assert.equal(navigateText(layout, "abcd", point, point, key, options).focus.paragraph, 2);
    const checked = [];
    const next = navigateText(layout, "abcd", point, point, key, { ...options, acceptRow: row => { checked.push(row.paragraph); return row.paragraph !== 2; } });
    assert.equal(next.focus.paragraph, to);
    assert.deepEqual(next.anchor, point);
    assert.equal(next.focus.unit, 1);
    if (key === "ArrowDown") assert.equal(checked.includes(4), false, "do not query ownership farther than an accepted row");
    assert.equal(navigateText(layout, "abcd", point, point, key, { ...options, acceptRow: () => false }).focus.paragraph, from);
  }
  assert.deepEqual(layout, before);
});

test("vertical Canvas navigation skips foreign owners before choosing an eligible row", async t => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwp");
  const before = Buffer.from(input), h = await workerCanvasHarness(t);
  assert.equal((await h.send({ kind: "load", bytes: input })).error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  for (const [from, foreign, to] of [[13, 11, 14], [17, 16, 18], [208, 219, 209]]) {
    const start = { section: 0, paragraph: from, unit: 0 };
    assert.equal(h.renderer.selectionRanges(start, { section: 0, paragraph: foreign, unit: 0 }), null);
    assert(h.renderer.selectionRanges(start, { section: 0, paragraph: to, unit: 0 }));
    for (const shiftKey of [false, true]) {
      assert.equal(h.controller.selectTextRange({ section: 0, paragraph: from, startUnit: 0, endUnit: 0 }), true);
      const count = h.requests.length;
      const event = dispatchCanvasEvent(h.input, "keydown", { key: "ArrowDown", shiftKey });
      assert.equal(event.defaultPrevented, true);
      const focus = h.canvas.dataset.caret.split(":").map(Number);
      assert.deepEqual(focus.slice(0, 2), [0, to], `from ${from}, shift ${shiftKey}`);
      assert.equal(h.requests.length, count, "navigation must not mutate native state");
      if (shiftKey) {
        assert.equal(h.controller.selectedRange(), null);
        assert(h.renderer.selectionRanges(start, { section: focus[0], paragraph: focus[1], unit: focus[2] }));
      }
    }
  }
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), before);
  assert.deepEqual(input, before);
});
