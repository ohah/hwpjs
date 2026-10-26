import test from "node:test";
import assert from "node:assert/strict";
import { isSingleInlineTableHost } from "../../web/preview/single-inline-table-host.mjs";
import { placeInlineTablePages } from "../../web/preview/inline-table-page-placement.mjs";

const paragraph = {
  section: 0,
  paragraph: 0,
  text: "\ufffc\ufffc\ufffc",
  structuralAnchors: [
    { kind: "section", paragraph: 0, unit: 0, control_node: 1 },
    { kind: "column", paragraph: 0, unit: 1, control_node: 2 },
  ],
};
const table = {
  section: 0,
  hostParagraph: 0,
  anchorUnit: 2,
  sourceGeometry: { geometry: { treat_as_character: true } },
};
test("single inline table classification preserves typed structural source units", () => {
  const before = structuredClone({ paragraph, table });
  assert.equal(isSingleInlineTableHost(paragraph, table), true);
  assert.deepEqual({ paragraph, table }, before);
  assert.equal(
    isSingleInlineTableHost(
      { section: 0, paragraph: 0, text: "\ufffc" },
      { ...table, anchorUnit: 0 },
    ),
    true,
  );
});
test("structural-only inline host has the same placement as its single table anchor without source mutation", () => {
  const owner = { ...paragraph, paragraphShape: { alignment: 3, left: 0, right: 0, indent: 0 } };
  const item = { ...table, tableNode: 7 };
  const layout = {
    state: "placed",
    boxes: [
      {
        section: 0,
        tableNode: 7,
        pageOrdinal: 0,
        x: 20,
        y: 40,
        width: 80,
        height: 60,
        referenceBoxes: { column: { x: 20, y: 20, width: 200, height: 300 } },
      },
    ],
    rows: [{ section: 0, tableNode: 7, x: 24, y: 44 }],
  };
  const before = structuredClone({ owner, item, layout });
  const actual = placeInlineTablePages(item, owner, layout, 10);
  const single = placeInlineTablePages(
    { ...item, anchorUnit: 0 },
    { ...owner, text: "\ufffc", structuralAnchors: [] },
    layout,
    10,
  );
  assert.equal(actual.state, "placed");
  assert.deepEqual(actual, single);
  assert.deepEqual({ owner, item, layout }, before);
  assert.equal(
    placeInlineTablePages(item, { ...owner, structuralAnchors: [] }, layout, 10).error,
    "UnsupportedInlineTableHost",
  );
});
test("text unknown controls duplicate metadata wrong owners and floating tables are not table-only", () => {
  for (const [p, t] of [
    [{ ...paragraph, text: paragraph.text + "A" }, table],
    [{ ...paragraph, structuralAnchors: [] }, table],
    [
      {
        ...paragraph,
        structuralAnchors: [paragraph.structuralAnchors[0], paragraph.structuralAnchors[0]],
      },
      table,
    ],
    [paragraph, { ...table, section: 1 }],
    [paragraph, { ...table, anchorUnit: 0 }],
    [paragraph, { ...table, sourceGeometry: { geometry: { treat_as_character: false } } }],
  ])
    assert.equal(isSingleInlineTableHost(p, t), false);
});
