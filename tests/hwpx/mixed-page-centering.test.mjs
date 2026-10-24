import test from "node:test";
import assert from "node:assert/strict";
import { layoutPageSections } from "../../web/preview/page-section-layout.mjs";
import { moveSectionBox, moveSectionRow, moveSectionPlacement } from "../../web/preview/section-layout-offset.mjs";

const families = ["placedDrawings", "placedContainers", "flowPictures", "groupReservations", "pageNumberGlyphs", "tableAnchors", "flowAnchors", "tableCollisionFootprints", "tableCollisionFootprintErrors", "tableColumnEvidence", "tableCaptionBounds", "pageAreaDeclarationPages", "hostNumberPrefixes", "noteSeparators", "pageAreaOverflow"];
const rowFamilies = ["boxes", "repeatedTableHeaderRows", "repeatedTableHeaderBoxes"];
const content = () => ({ pageSettings: [0, 1, 2].map(section_ordinal => ({ section_ordinal })), paragraphs: [0, 1, 2].map(section => ({ section })) });
function part(section, width, x = 20) {
  const box = { x, y: 20, width, height: 100 };
  const row = { section, pageOrdinal: 0, x: 7, y: 8, referenceBoxes: { paper: box }, pageClip: box };
  const placement = { ...row, kind: "anchor", height: 0, rectangle: box, outerRectangle: box, origin: box, captionRectangle: box, bounds: box, footprint: box };
  return { state: "paginated", height: 140, limited: false,
    pages: [{ ordinal: 0, section, paper: box, page: box, columns: [box], header: box, footer: box }],
    rows: [row, { ...row, transform: [0, 1, -1, 0, 30, 40], inlineGroupPlacements: [placement] }],
    ...Object.fromEntries(families.map(key => [key, [placement]])),
    ...Object.fromEntries(rowFamilies.map(key => [key, [row]])),
    pageAreaSelectionPolicy: "declared", createdTablesPaginated: true,
    createdCellParagraphs: [{ section, createdCell: true, x: 3, y: 4 }],
  };
}
function captionedPicture() {
  return { section: 2, pictureNode: 99, pageOrdinal: 0, columnOrdinal: 1,
    rectangle: { x: 40, y: 30, width: 60, height: 20 },
    flowRectangle: { x: 40, y: 30, width: 60, height: 40 },
    captionRectangle: { x: 40, y: 55, width: 60, height: 15 },
    captionRows: [{ kind: "text", section: 2, pictureNode: 99, captionNode: 100, listNode: 101,
      x: 40, y: 55, width: 60, height: 15, text: "caption" }],
    paintOrigin: { x: 42, y: 32 }, visualBounds: { x: 38, y: 28, width: 64, height: 44 },
    referenceBoxes: { column: { x: 25, y: 25, width: 700, height: 90 } },
    pageClip: { x: 20, y: 20, width: 794, height: 100 },
  };
}
function run(parts, maxRows = 30, source = content()) {
  const calls = [];
  const result = layoutPageSections(source, () => 8, maxRows, (scoped, measure, budget) => {
    const section = scoped.pageSettings[0].section_ordinal;
    calls.push([section, budget]);
    measure("once");
    return parts[section];
  });
  return { result, calls };
}
test("mixed paper families share scene center and every world family moves once without source mutation", () => {
  const source = content(), parts = [part(0, 794), part(1, 1122), part(2, 794)];
  parts[2].flowPictures = [captionedPicture()];
  const snapshot = structuredClone({ source, parts });
  const { result, calls } = run(parts, 30, source);
  assert.equal(result.state, "paginated", result.error);
  assert.deepEqual(calls, [[0, 30], [1, 27], [2, 24]]);
  assert.deepEqual(result.pages.map(p => p.paper.x), [184, 20, 184]);
  assert.deepEqual(result.pages.map(p => p.paper.x + p.paper.width / 2), [581, 581, 581]);
  for (let section = 0; section < 3; section++) {
    const dx = section === 1 ? 0 : 164, dy = section * 140;
    const original = parts[section], page = result.pages[section];
    for (const key of ["paper", "page", "header", "footer"]) assert.deepEqual(page[key], moveSectionBox(original.pages[0][key], dy, dx));
    assert.deepEqual(page.columns, original.pages[0].columns.map(b => moveSectionBox(b, dy, dx)));
    assert.deepEqual(result.rows.slice(section * 2, section * 2 + 2), original.rows.map(r => moveSectionRow(r, dy, section, dx)));
    assert.equal(result.rows[section * 2 + 1].x, 7, "affine local coordinates stay local");
    assert.deepEqual(result.rows[section * 2 + 1].transform, [0, 1, -1, 0, 30 + dx, 40 + dy]);
    for (const key of families) assert.deepEqual(result[key][section], moveSectionPlacement(original[key][0], dy, section, dx), key);
    for (const key of rowFamilies) assert.deepEqual(result[key][section], moveSectionRow(original[key][0], dy, section, dx), key);
  }
  const picture = result.flowPictures[2];
  assert.deepEqual(picture.rectangle, { x: 204, y: 310, width: 60, height: 20 });
  assert.deepEqual(picture.flowRectangle, { x: 204, y: 310, width: 60, height: 40 });
  assert.deepEqual(picture.captionRectangle, { x: 204, y: 335, width: 60, height: 15 });
  assert.deepEqual(picture.paintOrigin, { x: 206, y: 312 });
  assert.deepEqual(picture.visualBounds, { x: 202, y: 308, width: 64, height: 44 });
  assert.deepEqual(picture.referenceBoxes.column, { x: 189, y: 305, width: 700, height: 90 });
  assert.deepEqual(picture.pageClip, { x: 184, y: 300, width: 794, height: 100 });
  assert.deepEqual(picture.captionRows, [{ kind: "text", section: 2, pictureNode: 99, captionNode: 100,
    listNode: 101, x: 204, y: 335, width: 60, height: 15, text: "caption", pageOrdinal: 2, columnOrdinal: 1,
    referenceBoxes: { column: { x: 189, y: 305, width: 700, height: 90 } } }]);
  assert.equal(picture.pageOrdinal, 2);
  assert.equal(picture.columnOrdinal, 1);
  assert.equal(result.height, 420);
  assert.equal(result.pageAreaSelectionPolicy, "declared");
  assert.equal(result.createdTablesPaginated, true);
  assert.deepEqual(result.createdCellParagraphs, parts.flatMap(p => p.createdCellParagraphs));
  assert.deepEqual({ source, parts }, snapshot);
});
test("uniform width leaves horizontal geometry unchanged; actual extents include nondefault origins", () => {
  const parts = [part(0, 794), part(1, 794), part(2, 794)];
  parts[2].flowPictures = [captionedPicture()];
  const uniform = run(parts).result;
  assert.deepEqual(uniform.pages.map(p => p.paper.x), [20, 20, 20]);
  assert.deepEqual(uniform.flowPictures[2].rectangle, { x: 40, y: 310, width: 60, height: 20 });
  assert.deepEqual(uniform.flowPictures[2].flowRectangle, { x: 40, y: 310, width: 60, height: 40 });
  assert.equal(uniform.flowPictures[2].captionRows[0].x, 40);
  assert.equal(uniform.flowPictures[2].captionRows[0].y, 335);
  const varied = run([part(0, 400, 100), part(1, 800, 40), part(2, 400, -20)]).result;
  assert.deepEqual(varied.pages.map(p => p.paper.x + p.paper.width / 2), [410, 410, 410]);
});
test("budget counts repeated headers, callbacks once, and limited stops collection", () => {
  const parts = [part(0, 794), part(1, 1122), part(2, 794)];
  const bounded = run(parts, 3);
  assert.deepEqual(bounded.calls, [[0, 3]]);
  assert.equal(bounded.result.limited, true);
  assert.equal(bounded.result.pages[0].paper.x, 20);
  parts[0].limited = true;
  assert.deepEqual(run(parts).calls, [[0, 30]]);
  assert.equal(run(parts).result.limited, true);
  assert.deepEqual(run(parts, 0).calls, []);
  assert.equal(run(parts, 0).result.error, "InvalidPageFlowBounds");
  assert.equal(run(parts, 2).result.error, "InvalidSectionLayout");
});
test("invalid geometry and incompatible centers are explicit failures", () => {
  for (const mutate of [p => p.flowRectangle.width = 0, p => p.captionRectangle.y = 100,
    p => p.captionRows[0].pictureNode++, p => p.captionRows[0].x = Infinity,
    p => p.captionRows = new Array(1), p => delete p.rectangle]) {
    const parts = [part(0, 794), part(1, 1122), part(2, 794)];
    const picture = captionedPicture(); mutate(picture); parts[2].flowPictures = [picture];
    const before = structuredClone(parts);
    assert.equal(run(parts).result.error, "InvalidPicturePlacementTranslation");
    assert.deepEqual(parts, before);
  }
  for (const change of [{ x: NaN }, { width: -1 }, { width: Infinity }, { height: 0 }]) {
    const parts = [part(0, 794)];
    Object.assign(parts[0].pages[0].paper, change);
    assert.equal(run(parts).result.error, "InvalidSectionLayout");
    assert.deepEqual(run(parts).calls, [[0, 30]]);
  }
  const parts = [part(0, 794)];
  parts[0].pages.push({ ...parts[0].pages[0], ordinal: 1, paper: { ...parts[0].pages[0].paper, x: 21 } });
  assert.equal(run(parts).result.error, "UnsupportedSectionPaperCenters");
});
test("policy and created-cell contracts survive collection and reject conflicts", () => {
  const parts = [part(0, 794), part(1, 1122), part(2, 794)];
  parts[1].pageAreaSelectionPolicy = "other";
  assert.equal(run(parts).result.error, "ConflictingSectionPageAreaPolicy");
  assert.deepEqual(run(parts).calls, [[0, 30], [1, 27]]);
  parts[1].pageAreaSelectionPolicy = "declared";
  parts[0].createdCellParagraphs[0].section = 2;
  assert.equal(run(parts).result.error, "InvalidSectionLayout");
  parts[0].createdCellParagraphs[0].section = 0;
  const source = content(); source.limited = true;
  assert.equal(run(parts, 30, source).result.limited, true);
});
test("multiple pages with the same center retain all areas and page ordinals", () => {
  const parts = [part(0, 794), part(1, 1122), part(2, 794)];
  parts[0].pages.push({ ...parts[0].pages[0], ordinal: 1, paper: { x: 117, y: 140, width: 600, height: 100 } });
  parts[0].height = 260;
  const { result } = run(parts);
  assert.equal(result.state, "paginated", result.error);
  assert.deepEqual(result.pages.map(p => p.ordinal), [0, 1, 2, 3]);
  assert.deepEqual(result.pages.map(p => p.paper.x + p.paper.width / 2), [581, 581, 581, 581]);
  assert.deepEqual(result.rows.map(r => r.pageOrdinal), [0, 0, 2, 2, 3, 3]);
  assert.equal(result.pageAreaOverflow.length, 3);
});
