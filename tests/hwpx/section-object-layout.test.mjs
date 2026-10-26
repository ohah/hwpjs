import test from "node:test";
import assert from "node:assert/strict";
import { sectionObjectContent } from "../../web/preview/section-object-content.mjs";
import { layoutPageSections } from "../../web/preview/page-section-layout.mjs";
import { moveSectionPlacement } from "../../web/preview/section-layout-offset.mjs";

test("section scoping isolates declaration coordinates and errors with overlapping local IDs", () => {
  const content = {
    pictures: [0, 1].map((section) => ({ section, pictureNode: 9 })),
    pageAreaDeclarations: [0, 1].map((section) => ({
      section,
      sourceElement: 12,
      paragraph: 0,
      unit: 0,
    })),
    pageAreaDeclarationErrors: [{ section: 1, error: "UnsupportedParagraphControl" }],
  };
  const before = structuredClone(content),
    known = new Map([
      [0, {}],
      [1, {}],
    ]);
  const scoped = sectionObjectContent(content, 0, known);
  assert.deepEqual(
    scoped.pageAreaDeclarations.map((d) => d.section),
    [0],
  );
  assert.deepEqual(scoped.pageAreaDeclarationErrors, []);
  assert.deepEqual(
    scoped.pictures.map((p) => p.section),
    [0],
  );
  assert.deepEqual(content, before);
  for (const key of ["pictures", "pageAreaDeclarations", "pageAreaDeclarationErrors"])
    assert.throws(() => sectionObjectContent({ ...content, [key]: [{ section: 8 }] }, 0, known), {
      message: "UnsupportedPageSections",
    });
});

test("section join retains affine rows, object reference boxes, declarations, and overflow coordinates", () => {
  const input = {
    paragraphs: [0, 1].map((section) => ({ section, paragraph: 0 })),
    pageSettings: [0, 1].map((section_ordinal) => ({ section_ordinal })),
  };
  const parts = [],
    before = structuredClone(input);
  const result = layoutPageSections(
    input,
    () => 8,
    100,
    (scoped) => {
      const section = scoped.pageSettings[0].section_ordinal;
      const referenceBoxes = {
        paper: { x: 0, y: 0, width: 100, height: 100 },
        page: { x: 10, y: 10, width: 80, height: 80 },
      };
      const part = {
        state: "paginated",
        limited: false,
        height: 100,
        pages: [
          {
            ordinal: 0,
            section,
            paper: referenceBoxes.paper,
            page: referenceBoxes.page,
            columns: [referenceBoxes.page],
          },
        ],
        rows: [
          {
            kind: "text",
            section,
            paragraph: 0,
            x: 2,
            y: 3,
            height: 5,
            pageOrdinal: 0,
            transform: [0, 1, -1, 0, 20, 30],
            referenceBoxes,
          },
        ],
        placedDrawings: [
          {
            section,
            drawingNode: 9,
            pageOrdinal: 0,
            rectangle: { x: 1, y: 15, width: 5, height: 5 },
            referenceBoxes,
          },
        ],
        pageAreaDeclarationPages: [
          { section, sourceElement: 12, paragraph: 0, unit: 0, pageOrdinal: 0 },
        ],
        pageAreaSelectionPolicy: "rhwp-declaration-start",
        pageAreaOverflow: [
          { section, pageOrdinal: 0, rectangle: { x: 1, y: 16, width: 5, height: 5 } },
        ],
      };
      parts.push(structuredClone(part));
      return part;
    },
  );
  assert.equal(result.state, "paginated", result.error);
  assert.equal(result.rows[1].transform[5], 130);
  assert.equal(result.rows[1].y, 3);
  assert.equal(result.placedDrawings[1].rectangle.y, 115);
  assert.equal(result.placedDrawings[1].referenceBoxes.page.y, 110);
  assert.deepEqual(
    result.pageAreaDeclarationPages.map((d) => [d.section, d.pageOrdinal]),
    [
      [0, 0],
      [1, 1],
    ],
  );
  assert.equal(result.pageAreaSelectionPolicy, "rhwp-declaration-start");
  assert.equal(result.pageAreaOverflow[1].rectangle.y, 116);
  assert.equal(result.pageAreaOverflow[1].pageOrdinal, 1);
  assert.equal(parts[1].placedDrawings[0].rectangle.y, 15);
  assert.deepEqual(input, before);
});

test("section placement offsets reject nonfinite coordinates rather than publishing invalid geometry", () => {
  const placement = { section: 0, pageOrdinal: 0, rectangle: { x: 0, y: 10, width: 5, height: 5 } };
  for (const offset of [NaN, Infinity, -Infinity])
    assert.throws(() => moveSectionPlacement(placement, offset, 0));
});

test("late malformed section output cannot publish partial rows or conceal a foreign owner", () => {
  const input = {
    paragraphs: [0, 1].map((section) => ({ section, paragraph: 0 })),
    pageSettings: [0, 1].map((section_ordinal) => ({ section_ordinal })),
  };
  const part = (section) => ({
    state: "paginated",
    height: 100,
    limited: false,
    pages: [{ ordinal: 0, section, paper: { y: 0 }, page: { y: 0 }, columns: [] }],
    rows: [{ section, pageOrdinal: 0, y: 0 }],
  });
  for (const mutate of [
    (p) => {
      p.rows[0].section = 0;
    },
    (p) => {
      p.pages[0].ordinal = 1;
    },
    (p) => {
      p.pages[0].paper.y = Infinity;
    },
    (p) => {
      delete p.pages[0].paper;
    },
    (p) => {
      p.pages[0].columns = [null];
    },
    (p) => {
      p.placedDrawings = [{ section: 0 }];
    },
    (p) => {
      p.pageAreaOverflow = [{ section: 0, pageOrdinal: 0 }];
    },
    (p) => {
      p.rows.push(...Array(100).fill(p.rows[0]));
    },
  ]) {
    const result = layoutPageSections(
      input,
      () => 8,
      100,
      (scoped) => {
        const section = scoped.pageSettings[0].section_ordinal,
          value = part(section);
        if (section === 1) mutate(value);
        return value;
      },
    );
    assert.equal(result.state, "unavailable");
    assert.equal(result.rows, undefined);
  }
  for (const content of [null, {}, { pageSettings: [null], paragraphs: [] }])
    assert.equal(
      layoutPageSections(
        content,
        () => 8,
        100,
        () => part(0),
      ).state,
      "unavailable",
    );
});
