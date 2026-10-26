import test from "node:test";
import assert from "node:assert/strict";
import { paginatePictureParagraph } from "../../web/preview/picture-paragraph-pages.mjs";
import { pageParagraphCoverage } from "../../web/preview/page-paragraph-coverage.mjs";

const setting = {
  width: 15000,
  height: 7500,
  orientation: "widely",
  gutter_type: "left_only",
  duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const paragraph = (text) => ({ section: 0, paragraph: 0, text, editable: true });
const row = (startUnit, endUnit, text) => ({
  kind: "text",
  section: 0,
  paragraph: 0,
  startUnit,
  endUnit,
  text,
});

test("terminal LF CR and CRLF keep one empty insertion row and exact source coverage", () => {
  for (const ending of ["\n", "\r", "\r\n"]) {
    const p = paragraph("a" + ending),
      before = structuredClone(p);
    const result = paginatePictureParagraph(p, setting, [], () => 8);
    assert.equal(result.state, "paginated", result.error);
    assert.deepEqual(
      result.rows.map((r) => [r.startUnit, r.endUnit, r.text]),
      [
        [0, p.text.length, p.text],
        [p.text.length, p.text.length, ""],
      ],
    );
    assert.deepEqual(result.rows[1].boundaries, [{ unit: p.text.length, x: 0 }]);
    assert.equal(pageParagraphCoverage([p], result.rows).state, "complete");
    assert.deepEqual(p, before);
  }
});

test("terminal row retains measured font height and moves to the next page when necessary", () => {
  const p = paragraph("a\n"),
    measure = () => ({ width: 8, height: 40 });
  const result = paginatePictureParagraph(p, { ...setting, height: 6000 }, [], measure);
  assert.equal(result.state, "paginated", result.error);
  assert.deepEqual(
    result.rows.map((r) => [r.pageOrdinal, r.textHeight, r.height]),
    [
      [0, 40, 48],
      [1, 40, 48],
    ],
  );
  assert.equal(result.rows[1].y, result.pages[1].page.y);
  assert.equal(pageParagraphCoverage([p], result.rows).state, "complete");
});

test("reserved picture space also excludes the terminal insertion row", () => {
  const p = paragraph("a\n");
  const reservations = [
    {
      pageOrdinal: 0,
      rectangle: { x: 20, y: 48, width: 200, height: 30 },
      flow: { textWrap: 1, outsideMargins: [0, 0, 0, 0] },
    },
  ];
  const result = paginatePictureParagraph(p, setting, reservations, () => 8);
  assert.equal(result.state, "paginated", result.error);
  assert.equal(result.rows[1].y, 78);
  assert.equal(pageParagraphCoverage([p], result.rows).state, "complete");
});

test("coverage never accepts duplicate or interior insertion rows or fake terminal breaks", () => {
  const p = paragraph("a\n"),
    rows = [row(0, 2, p.text), row(2, 2, "")],
    before = structuredClone(rows);
  assert.equal(pageParagraphCoverage([p], rows).state, "complete");
  for (const invalid of [
    [...rows, row(2, 2, "")],
    [row(0, 1, "a"), row(1, 1, ""), row(1, 2, "\n")],
    [row(0, 2, "wrong"), row(2, 2, "")],
  ]) {
    assert.equal(pageParagraphCoverage([p], invalid).state, "unavailable");
  }
  assert.equal(
    pageParagraphCoverage([paragraph("a")], [row(0, 1, "a"), row(1, 1, "")]).state,
    "unavailable",
  );
  assert.equal(pageParagraphCoverage([paragraph("")], [row(0, 0, "")]).state, "complete");
  assert.equal(
    pageParagraphCoverage([paragraph("")], [row(0, 0, ""), row(0, 0, "")]).state,
    "unavailable",
  );
  assert.deepEqual(rows, before);
});
