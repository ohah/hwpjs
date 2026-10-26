import test from "node:test";
import assert from "node:assert/strict";
import { tableAnchorCoverage } from "../../web/preview/table-anchor-coverage.mjs";
import { pageParagraphCoverage } from "../../web/preview/page-paragraph-coverage.mjs";

test("table coverage consumes only exact placed anchors without inventing render rows", () => {
  const paragraph = { section: 0, paragraph: 1, text: "A\ufffcB" };
  const table = {
    section: 0,
    tableNode: 9,
    hostParagraph: 1,
    anchorUnit: 1,
    cells: [{ listNode: 4 }],
    sourceGeometry: { geometry: { treat_as_character: true } },
  };
  const anchor = { section: 0, tableNode: 9, hostParagraph: 1, anchorUnit: 1 };
  const content = { paragraphs: [paragraph], tables: [table] };
  const layout = {
    rows: [
      { kind: "text", section: 0, paragraph: 1, text: "A", startUnit: 0, endUnit: 1 },
      { kind: "text", section: 0, paragraph: 1, text: "B", startUnit: 2, endUnit: 3 },
    ],
    tableAnchors: [anchor],
    boxes: [
      {
        section: 0,
        tableNode: 9,
        listNode: 4,
        pageOrdinal: 0,
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      },
    ],
  };
  const before = structuredClone({ content, layout });
  const coverage = tableAnchorCoverage(content, layout);
  assert.equal(coverage.state, "covered", coverage.error);
  assert.equal(coverage.rows.length, 1);
  assert.equal(coverage.rows[0].coverageOnly, true);
  assert.equal(
    pageParagraphCoverage([paragraph], [...layout.rows, ...coverage.rows]).state,
    "complete",
  );
  assert.equal(
    tableAnchorCoverage(content, { ...layout, boxes: [] }).error,
    "MissingTableAnchorCoveragePlacement",
  );
  assert.equal(
    tableAnchorCoverage(content, { ...layout, tableAnchors: [anchor, anchor] }).error,
    "AmbiguousTableAnchorCoverage",
  );
  assert.equal(
    tableAnchorCoverage(content, { ...layout, tableAnchors: [{ ...anchor, anchorUnit: 0 }] }).error,
    "InvalidTableAnchorCoverage",
  );
  assert.deepEqual(
    tableAnchorCoverage(content, {
      ...layout,
      rows: [
        { kind: "text", section: 0, paragraph: 1, text: paragraph.text, startUnit: 0, endUnit: 3 },
      ],
    }).rows,
    [],
  );
  assert.deepEqual({ content, layout }, before);
  for (const damaged of [
    { ...content, tables: [null] },
    { ...content, paragraphs: [null] },
    { ...content, tables: [{ ...table, cells: [null] }] },
  ]) {
    assert.equal(tableAnchorCoverage(damaged, layout).error, "InvalidTableAnchorCoverage");
  }
  for (const damaged of [
    { ...layout, rows: [null] },
    { ...layout, boxes: [null] },
  ])
    assert.equal(tableAnchorCoverage(content, damaged).error, "InvalidTableAnchorCoverage");
});
