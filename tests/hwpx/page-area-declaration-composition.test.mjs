import test from "node:test";
import assert from "node:assert/strict";
import { composePageAreaBody } from "../../web/preview/page-area-body-composition.mjs";

function fixture() {
  const numbering = {
    supported: true,
    start_page: 1,
    hide_first_header: false,
    hide_first_footer: false,
  };
  const area = (owner_node) => ({
    owner_node,
    list_node: owner_node + 1,
    apply: "both",
    width: 7500,
    height: 2250,
    vertical_alignment: "top",
  });
  const paragraphs = [
    { section: 0, paragraph: 0, text: "abcde" },
    { section: 0, paragraph: 1, text: "old" },
    { section: 0, paragraph: 2, text: "new" },
  ];
  const content = {
    paragraphs,
    paragraphFlows: [
      { section: 0, paragraph: 0, host: "body" },
      ...[10, 20].map((owner, index) => ({
        section: 0,
        paragraph: index + 1,
        host: "footer",
        page_area: area(owner),
        page_number_source: numbering,
      })),
    ],
    pageSettings: [{ section_ordinal: 0, margin: { top: 750, bottom: 2250, header: 2250 } }],
    pageAreaDeclarations: [
      { section: 0, sourceElement: 10, paragraph: 0, unit: 0 },
      { section: 0, sourceElement: 20, paragraph: 0, unit: 3 },
    ],
    pageAreaDeclarationErrors: [],
  };
  const pages = [0, 1, 2].map((ordinal) => ({
    ordinal,
    section: 0,
    paper: { x: 0, y: ordinal * 200, width: 140, height: 180 },
    page: { x: 20, y: ordinal * 200 + 20, width: 100, height: 100 },
  }));
  const rows = [
    [0, 2],
    [2, 4],
    [4, 5],
  ].map(([startUnit, endUnit], pageOrdinal) => ({
    kind: "text",
    section: 0,
    paragraph: 0,
    text: "abcde".slice(startUnit, endUnit),
    startUnit,
    endUnit,
    x: 20,
    y: pageOrdinal * 200 + 20,
    width: 100,
    height: 20,
    textHeight: 20,
    textTop: 0,
    pageOrdinal,
  }));
  return {
    content,
    body: { state: "paginated", limited: false, pages, rows, height: 600, boxes: [] },
  };
}
const measure = () => ({ width: 8, height: 16 });
const run = (f, maxRows = 100) => composePageAreaBody(f.content, measure, maxRows, () => f.body);
const footers = (layout) =>
  layout.rows
    .filter((row) => row.pageArea === "footer")
    .map((row) => [row.pageOrdinal, row.paragraph]);

test("composition switches repeated footer text only from its bound source page", () => {
  const f = fixture(),
    before = structuredClone(f),
    result = run(f);
  assert.equal(result.state, "paginated", result.error);
  assert.equal(result.pageAreaSelectionPolicy, "rhwp-declaration-start");
  assert.deepEqual(footers(result), [
    [0, 1],
    [1, 2],
    [2, 2],
  ]);
  assert.equal(result.boxes, f.body.boxes);
  assert.deepEqual(f, before);
});

test("specific parity survives a later BOTH and hide only suppresses output", () => {
  const f = fixture();
  f.content.paragraphFlows[1].page_area.apply = "odd";
  assert.deepEqual(footers(run(f)), [
    [0, 1],
    [1, 2],
    [2, 1],
  ]);
  f.content.paragraphFlows[1].page_number_source.hide_first_footer = true;
  assert.deepEqual(footers(run(f)), [
    [1, 2],
    [2, 1],
  ]);
});

test("old ABI keeps ambiguous owner refusal while malformed new binding never falls back", () => {
  const old = fixture();
  delete old.content.pageAreaDeclarations;
  delete old.content.pageAreaDeclarationErrors;
  assert.equal(run(old).error, "AmbiguousPageAreaOwner");
  const broken = fixture();
  broken.content.pageAreaDeclarationErrors.push({ section: 0, error: "SourceBindingMismatch" });
  assert.equal(run(broken).error, "MissingPageAreaDeclarationLayout");
  const boundary = fixture();
  boundary.content.pageAreaDeclarations[1].unit = 2;
  assert.equal(run(boundary).error, "AmbiguousPageAreaDeclarationPage");
  assert.equal(run(fixture(), 4).error, "PageAreaOverflow");
});
