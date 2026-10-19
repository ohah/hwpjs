import test from "node:test";
import assert from "node:assert/strict";
import { layoutPageAreas } from "../../web/preview/page-area-flow.mjs";
import { hitText, caretGeometry, selectionRects } from "../../web/preview/text-geometry.mjs";
import { navigateText } from "../../web/preview/text-navigation.mjs";
import { rowAtPoint } from "../../web/preview/row-geometry.mjs";
const content = {
  paragraphs: [{ section: 0, paragraph: 1, text: "header", label: "debug", editable: true }, { section: 0, paragraph: 2, text: "footer", label: "debug", editable: true }],
  paragraphFlows: ["header", "footer"].map((host, index) => ({ host, section: 0, paragraph: index + 1, page_area: { owner_node: index, list_node: index + 4, apply: index ? "odd" : "both", vertical_alignment: index ? "bottom" : "top", width: 7200, height: 7200 } })),
};
const pages = [0, 1].map(ordinal => ({ ordinal, number: ordinal + 1, header: { x: 20, y: ordinal * 1000 + 20, width: 96, height: 96 }, footer: { x: 20, y: ordinal * 1000 + 800, width: 96, height: 96 } }));
test("overlapping spatial rows use paint order even without page mode metadata", () => {
  const rows = [{ kind: "text", x: 20, y: 20, width: 96, height: 100, pageArea: "header" }, { kind: "text", x: 20, y: 70, width: 96, height: 28 }];
  const layout = { rows, spatialRows: true, pageLayoutMode: "measured-body" };
  assert.equal(rowAtPoint(layout, 25, 75), 1);
  assert.equal(rowAtPoint(layout, 25, 40), 0);
  assert.equal(rowAtPoint({ rows, spatialRows: true }, 25, 75), 1);
});
test("page areas repeat identity with explicit odd-page applicability and vertical alignment", () => {
  const original = structuredClone(content);
  const result = layoutPageAreas(content, pages, () => 5);
  assert.equal(result.state, "placed");
  assert.deepEqual(result.rows.map(row => [row.paragraph, row.pageNumber, row.y]), [[1, 1, 20], [2, 1, 868], [1, 2, 1020]]);
  assert(result.rows.every(row => row.editable));
  assert.deepEqual(content, original);
  const layout = { ...result, rows: result.rows.toSorted((a, b) => a.y - b.y) };
  const clicked = hitText(layout, 25, 1025);
  assert.equal(clicked.pageOrdinal, 1);
  assert.equal(caretGeometry(layout, clicked).y, 1028);
  const rects = selectionRects(layout, { ...clicked, unit: 0 }, { ...clicked, unit: 6 });
  assert.equal(rects.length, 1); assert.equal(rects[0].y, 1028);
  assert.equal(hitText(layout, 25, 25, clicked).pageOrdinal, 1);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) {
    const navigation = navigateText(layout, "header", clicked, clicked, key);
    assert.equal(navigation.focus.pageOrdinal, 1, key);
    assert.equal(caretGeometry(layout, navigation.focus).y, 1028, key);
  }
});
test("page areas report vertical overflow but reject missing numbering and ambiguous owners", () => {
  assert.equal(layoutPageAreas(content, [{ ...pages[0], number: undefined }], () => 5).error, "MissingEffectivePageNumber");
  const tall = layoutPageAreas(content, pages, () => ({ width: 5, height: 200 }));
  assert.equal(tall.state, "placed");
  assert.equal(tall.overflow.length, 3);
  assert(tall.rows.every(row => row.editable));
  assert.equal(tall.rows.find(row => row.pageArea === "footer").y, 800);
  const wide = structuredClone(content); wide.paragraphFlows[0].page_area.width = 14400;
  assert.equal(layoutPageAreas(wide, pages, () => 5).error, "PageAreaOverflow");
  assert.equal(layoutPageAreas(content, pages, () => 5, 1).error, "PageAreaOverflow");
  const duplicate = structuredClone(content); duplicate.paragraphFlows.push({ ...duplicate.paragraphFlows[0], page_area: { ...duplicate.paragraphFlows[0].page_area, owner_node: 99 } });
  assert.equal(layoutPageAreas(duplicate, pages, () => 5).error, "AmbiguousPageAreaOwner");
  const hidden = layoutPageAreas(content, [{ ...pages[0], hideFirstHeader: true, hideFirstFooter: true }, pages[1]], () => 5);
  assert.equal(hidden.rows.length, 1);
  assert.equal(hidden.rows[0].pageNumber, 2);
});
