import test from "node:test";
import assert from "node:assert/strict";
import {
  canvasDisplayOptions,
  DEFAULT_CANVAS_DISPLAY_OPTIONS,
} from "../../web/preview/canvas-display-options.mjs";
import { paragraphMarkPlan, paintParagraphMark } from "../../web/preview/paragraph-mark-paint.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
const paragraph = (text = "AB CD\tE", extra = {}) => ({
  section: 0,
  paragraph: 0,
  text,
  editable: true,
  selectionOwner: "section:0:body",
  ...extra,
});
const row = (p, extra = {}) => ({
  kind: "text",
  section: p.section,
  paragraph: p.paragraph,
  text: p.text,
  startUnit: 0,
  endUnit: p.text.length,
  boundaries: [
    { unit: 0, x: 0 },
    { unit: p.text.length, x: 70 },
  ],
  lastLine: true,
  x: 20,
  y: 40,
  textHeight: 14,
  textTop: 0,
  ...extra,
});
test("only boolean paint option is accepted; no getter or model field is read", () => {
  assert.equal(DEFAULT_CANVAS_DISPLAY_OPTIONS.paragraphMarks, false);
  for (const v of [
    null,
    [],
    true,
    {},
    { paragraphMarks: 1 },
    { paragraphMarks: true, text: "changed" },
    Object.create({ paragraphMarks: true }),
  ])
    assert.throws(() => canvasDisplayOptions(v), /InvalidCanvasDisplayOptions/);
  let read = 0;
  const value = {
    get paragraphMarks() {
      read++;
      return true;
    },
  };
  assert.throws(() => canvasDisplayOptions(value));
  assert.equal(read, 0);
  assert.deepEqual(
    canvasDisplayOptions(Object.assign(Object.create(null), { paragraphMarks: true })),
    { paragraphMarks: true },
  );
  assert(Object.isFrozen(canvasDisplayOptions({ paragraphMarks: false })));
});
test("only complete last source row gets a mark, including empty paragraph", () => {
  for (const text of ["AB CD\tE", "", "A😀B"]) {
    const p = paragraph(text);
    assert(paragraphMarkPlan(row(p), 0, p));
    assert.equal(paragraphMarkPlan(row(p, { lastLine: false }), 0, p), null);
  }
});
test("clipped, source window, unknown owner and structural/rotated text are not invented ends", () => {
  for (const p of [
    paragraph("AB", { clipped: true }),
    paragraph("AB", { textStartUnit: 1 }),
    paragraph("AB", { selectionOwner: undefined }),
    paragraph("AB", { tableCell: { tableNode: 1, listNode: 2 } }),
    paragraph("AB", { drawingText: { drawingNode: 1, listNode: 2 } }),
  ])
    assert.equal(paragraphMarkPlan(row(p), 0, p), null);
  const p = paragraph();
  assert.equal(paragraphMarkPlan(row(p, { transform: [1, 0, 0, 1, 0, 0] }), 0, p), null);
});
test("unproven or malformed source/advance observations are refused atomically", () => {
  const p = paragraph();
  for (const patch of [
    { endUnit: 1 },
    { text: "other" },
    { startUnit: -1 },
    { boundaries: [] },
    { boundaries: [{ unit: p.text.length, x: NaN }] },
    { paragraph: 99 },
  ])
    assert.equal(paragraphMarkPlan(row(p, patch), 0, p), null);
});
test("two paragraphs with soft wrapping still have exactly two source-end marks", () => {
  const paragraphs = [paragraph("AB CD\tE"), paragraph("wrap ".repeat(24), { paragraph: 1 })],
    layout = layoutContent({ format: "hwpx", paragraphs }, 240, () => 10);
  const plans = layout.rows
    .map((r, i) =>
      paragraphMarkPlan(
        r,
        i,
        paragraphs.find((p) => p.paragraph === r.paragraph),
      ),
    )
    .filter(Boolean);
  assert.equal(plans.length, 2);
  assert(layout.rows.filter((r) => r.kind === "text").length > 2);
});
test("paint uses royal-blue strokes only and preserves caller state/source objects", () => {
  const p = paragraph(),
    r = row(p),
    before = JSON.stringify({ p, r }),
    calls = [],
    ctx = {
      save() {
        calls.push("save");
      },
      restore() {
        calls.push("restore");
      },
      beginPath() {},
      moveTo(...v) {
        calls.push(["move", ...v]);
      },
      lineTo(...v) {
        calls.push(["line", ...v]);
      },
      stroke() {
        calls.push(["stroke", this.strokeStyle, this.lineWidth]);
      },
    };
  Object.freeze(p);
  Object.freeze(r);
  assert.equal(paintParagraphMark(ctx, paragraphMarkPlan(r, 0, p), 10), true);
  assert.equal(calls[0], "save");
  assert.equal(calls.at(-1), "restore");
  assert(calls.some((c) => Array.isArray(c) && c[0] === "stroke" && c[1] === "#4169E1"));
  assert.equal(JSON.stringify({ p, r }), before);
});
