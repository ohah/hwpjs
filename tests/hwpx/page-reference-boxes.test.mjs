import test from "node:test";
import assert from "node:assert/strict";
import { pageReferenceBoxes } from "../../web/preview/page-reference-boxes.mjs";

const setting = {
  width: 72000,
  height: 144000,
  orientation: "widely",
  gutter_type: "left_only",
  duplicate_margins: 0,
  margin: { left: 7200, right: 14400, top: 7200, bottom: 7200, gutter: 3600, header: 0, footer: 0 },
};
test("zero symmetric mirrored binding is parity invariant without inventing binding ownership", () => {
  const mirrored = {
    ...setting,
    gutter_type: "left_right",
    margin: { ...setting.margin, right: 7200, gutter: 0 },
  };
  const before = structuredClone(mirrored);
  const single = { ...mirrored, gutter_type: "left_only" };
  for (const ordinal of [0, 1, 2, 100])
    assert.deepEqual(
      pageReferenceBoxes(mirrored, { x: 10, y: 20 }, ordinal),
      pageReferenceBoxes(single, { x: 10, y: 20 }, ordinal),
    );
  for (const margin of [
    { ...mirrored.margin, gutter: 1 },
    { ...mirrored.margin, right: 7201 },
  ])
    assert.equal(
      pageReferenceBoxes({ ...mirrored, margin }, { x: 0, y: 0 }).state,
      "unsupported_page_geometry",
    );
  assert.deepEqual(mirrored, before);
});
test("page boxes use physical units, margins and orientation", () => {
  const original = structuredClone(setting);
  assert.deepEqual(pageReferenceBoxes(setting, { x: 10, y: 20 }).boxes, {
    paper: { x: 10, y: 20, width: 960, height: 1920 },
    page: { x: 154, y: 116, width: 624, height: 1728 },
  });
  const landscape = pageReferenceBoxes({ ...setting, orientation: "narrowly" }, { x: 0, y: 0 });
  assert.equal(landscape.boxes.paper.width, 1920);
  assert.equal(landscape.boxes.paper.height, 960);
  for (const gutter_type of ["left_right", "top_bottom"])
    assert.equal(
      pageReferenceBoxes({ ...setting, gutter_type }, { x: 0, y: 0 }, 1).state,
      "unsupported_page_geometry",
    );
  assert.deepEqual(setting, original);
  const withAreas = pageReferenceBoxes(
    { ...setting, margin: { ...setting.margin, header: 3600, footer: 7200 } },
    { x: 10, y: 20 },
  );
  assert.equal(withAreas.boxes.page.y, 164);
  assert.equal(withAreas.boxes.page.height, 1584);
});
test("missing ambiguous overflowing or invalid geometry never invents a page", () => {
  for (const source of [
    null,
    { ...setting, width: null },
    { ...setting, orientation: null },
    { ...setting, duplicate_margins: 1 },
    { ...setting, gutter_type: "unknown" },
    { ...setting, margin: { ...setting.margin, left: 72000 } },
  ]) {
    assert.equal(pageReferenceBoxes(source, { x: 0, y: 0 }).state, "unsupported_page_geometry");
  }
  assert.equal(
    pageReferenceBoxes(setting, { x: Infinity, y: 0 }).state,
    "unsupported_page_geometry",
  );
  assert.equal(pageReferenceBoxes(setting, { x: 0, y: 0 }, -1).state, "unsupported_page_geometry");
});
