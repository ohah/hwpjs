import test from "node:test";
import assert from "node:assert/strict";
import {
  paragraphSelectionRanges,
  paragraphSelectionOwner,
  paragraphSelectionText,
} from "../../web/preview/paragraph-selection.mjs";
import { selectionRects } from "../../web/preview/text-geometry.mjs";

const paragraphs = [
  { section: 0, paragraph: 3, text: "A😀B", owner: "body" },
  { section: 0, paragraph: 4, text: "", owner: "body" },
  { section: 0, paragraph: 5, text: "XY", owner: "body", sourceOffsets: [{ at: 0, source: 8 }] },
];
const ownerOf = (row) => row.owner;
const anchor = { section: 0, paragraph: 3, unit: 1 };
const focus = { section: 0, paragraph: 5, unit: 1 };

test("multi paragraph clipboard preserves empty paragraphs scalar text and boundary-only selection", () => {
  assert.equal(paragraphSelectionText(paragraphs, anchor, focus, ownerOf), "😀B\n\nX");
  assert.equal(paragraphSelectionText(paragraphs, focus, anchor, ownerOf), "😀B\n\nX");
  assert.equal(
    paragraphSelectionText(paragraphs, { ...anchor, unit: 4 }, { ...focus, unit: 0 }, ownerOf),
    "\n\n",
  );
  assert.equal(paragraphSelectionText(paragraphs, anchor, anchor, ownerOf), "");
  assert.equal(
    paragraphSelectionText(paragraphs, anchor, focus, () => null),
    null,
  );
});

test("selection ownership separates native cell lists sections and unknown nested paragraphs", () => {
  const row = {
    section: 0,
    selectionOwner: "section:0:body",
    tableCell: { tableNode: 7, listNode: 9 },
  };
  assert.equal(paragraphSelectionOwner(row), "section:0:table:7:list:9");
  assert.notEqual(
    paragraphSelectionOwner(row),
    paragraphSelectionOwner({ ...row, tableCell: { tableNode: 7, listNode: 10 } }),
  );
  assert.notEqual(paragraphSelectionOwner(row), paragraphSelectionOwner({ ...row, section: 1 }));
  assert.equal(paragraphSelectionOwner({ section: 0, selectionOwner: null }), null);
  assert.equal(paragraphSelectionOwner({ ...row, tableCell: {} }), null);
});

test("multi paragraph selection maps reverse ranges empty paragraphs and retained source offsets", () => {
  const expected = [
    { section: 0, paragraph: 3, startUnit: 1, endUnit: 4 },
    { section: 0, paragraph: 5, startUnit: 8, endUnit: 9 },
  ];
  assert.deepEqual(paragraphSelectionRanges(paragraphs, anchor, focus, ownerOf), expected);
  assert.deepEqual(paragraphSelectionRanges(paragraphs, focus, anchor, ownerOf), expected);
  assert.deepEqual(paragraphSelectionRanges(paragraphs, anchor, anchor, ownerOf), []);
});

test("multi paragraph selection paint uses display positions rather than retained source units", () => {
  const ranges = paragraphSelectionRanges(paragraphs, anchor, focus, ownerOf, {
    sourcePositions: false,
  });
  assert.equal(ranges[1].startUnit, 0);
  assert.equal(ranges[1].endUnit, 1);
  const rows = paragraphs
    .filter((row) => row.text.length)
    .map((row, index) => ({
      ...row,
      editable: true,
      startUnit: 0,
      endUnit: row.text.length,
      y: index * 40,
      height: 40,
      textHeight: 20,
      boundaries: Array.from({ length: row.text.length + 1 }, (_, unit) => ({
        unit,
        x: unit * 10,
      })),
    }));
  const rects = selectionRects({ rows }, anchor, focus, ranges);
  assert.equal(rects.length, 2);
  assert.deepEqual(
    rects.map((row) => row.width),
    [30, 10],
  );
  assert.deepEqual(selectionRects({ rows }, anchor, focus, []), []);
});

test("multi paragraph selection rejects owner crossings missing endpoints clipping and surrogate halves", () => {
  for (const rows of [
    paragraphs.map((row, i) => (i === 1 ? { ...row, owner: "cell" } : row)),
    paragraphs.map((row, i) => (i === 1 ? { ...row, clipped: true } : row)),
  ])
    assert.equal(paragraphSelectionRanges(rows, anchor, focus, ownerOf), null);
  for (const point of [
    { ...focus, section: 1 },
    { ...focus, paragraph: 99 },
    { ...anchor, unit: 2 },
    { ...focus, unit: 9 },
  ])
    assert.equal(paragraphSelectionRanges(paragraphs, anchor, point, ownerOf), null);
  assert.equal(
    paragraphSelectionRanges(paragraphs, anchor, focus, () => null),
    null,
  );
  for (const malformed of [
    null,
    [null],
    [...paragraphs, paragraphs[0]],
    paragraphs.map((row, i) => (i === 1 ? { ...row, text: null } : row)),
  ]) {
    assert.equal(paragraphSelectionRanges(malformed, anchor, focus, ownerOf), null);
  }
});

test("drawing text and captions keep distinct validated list owners without inheriting body ownership", () => {
  const base = { section: 0, paragraph: 1, text: "AB", selectionOwner: "section:0:body" };
  const text = { ...base, drawingText: { drawingNode: 7, listNode: 9 } };
  const caption = { ...base, drawingCaption: { drawingNode: 7, captionNode: 8, listNode: 9 } };
  assert.equal(paragraphSelectionOwner(text), "section:0:drawing:7:text:list:9");
  assert.equal(paragraphSelectionOwner(caption), "section:0:drawing:7:caption:list:9");
  for (const field of ["section", "drawingNode", "listNode"])
    for (const value of [-1, 0.5, 0x100000000, NaN, "7", null]) {
      const row =
        field === "section"
          ? { ...text, section: value }
          : { ...text, drawingText: { ...text.drawingText, [field]: value } };
      assert.equal(paragraphSelectionOwner(row), null);
    }
  assert.equal(paragraphSelectionOwner({ ...text, drawingCaption: caption.drawingCaption }), null);
  assert.equal(
    paragraphSelectionOwner({ ...text, tableCell: { tableNode: 4, listNode: 5 } }),
    null,
  );
  assert.equal(
    paragraphSelectionRanges(
      [text, { ...caption, paragraph: 2 }],
      { section: 0, paragraph: 1, unit: 0 },
      { section: 0, paragraph: 2, unit: 1 },
    ),
    null,
  );
  assert.equal(
    paragraphSelectionRanges(
      [text, { ...text, paragraph: 2, drawingText: { drawingNode: 8, listNode: 9 } }],
      { section: 0, paragraph: 1, unit: 0 },
      { section: 0, paragraph: 2, unit: 1 },
    ),
    null,
  );
});
