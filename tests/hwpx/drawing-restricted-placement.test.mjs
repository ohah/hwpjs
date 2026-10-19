import test from "node:test";
import assert from "node:assert/strict";
import { restrictDrawingPlacement } from "../../web/preview/drawing-restricted-placement.mjs";
import { restrictDrawingLayout } from "../../web/preview/drawing-restricted-layout.mjs";

test("restricted placement obeys explicit page scope and never overlaps or mutates blockers", () => {
  const body = { x: 0, y: 0, width: 100, height: 100 }, rectangle = { x: 10, y: -5, width: 20, height: 10 };
  const policy = { section: 0, pageOrdinal: 2, restrictToBody: true, allowOverlap: true };
  const blockers = [0, 10, 20].map(y => ({ section: 0, pageOrdinal: 2, rectangle: { x: 10, y, width: 20, height: 10 } }));
  const before = structuredClone({ body, rectangle, blockers });
  const result = restrictDrawingPlacement(rectangle, body, blockers, policy);
  assert.equal(result.state, "placed", result.error); assert.equal(result.rectangle.y, 30);
  assert.equal(result.effectiveAllowOverlap, false);
  assert.equal(restrictDrawingPlacement(rectangle, body, blockers.map(b => ({ ...b, pageOrdinal: 3 })), policy).rectangle.y, 0);
  assert.equal(restrictDrawingPlacement({ ...rectangle, height: 101 }, body, [], policy).error, "DrawingExceedsBodyHeight");
  assert.equal(restrictDrawingPlacement(rectangle, body, [{ ...blockers[0], rectangle: { ...body } }], policy).error, "DrawingNeedsNextPage");
  assert.deepEqual({ body, rectangle, blockers }, before);
});

test("restricted affine text moves atomically while physical page references remain unchanged", () => {
  const source = { geometry: { width: 20, height: 10 }, caption: null, group_context: null,
    rendering: { matrix: [1, 0, 0, 0, 1, 0], angle: 0, flip: [false, false], reverse: null },
    rendering_corners: [[0, 0], [20, 0], [20, 10], [0, 10]], position: { relations: [2], flags: [false, true] } };
  const drawing = { section: 0, drawingNode: 7, source }, rectangle = { x: 10, y: 0, width: 20, height: 10 };
  const references = { paper: { x: 0, y: 0, width: 100, height: 100 } };
  const prepared = { state: "placed", pageOrdinal: 2, rectangle, rows: [{ section: 0, pageOrdinal: 2,
    x: 0, y: 0, transform: [1, 0, 0, 1, 10, 0], referenceBoxes: references }] };
  const inventory = { state: "collected", footprints: [{ kind: "drawing", node: 7, section: 0, pageOrdinal: 2, rectangle },
    { kind: "drawing", node: 8, section: 0, pageOrdinal: 2, rectangle: { ...rectangle } }] };
  const before = structuredClone({ drawing, prepared, inventory });
  const result = restrictDrawingLayout(drawing, prepared, inventory, references.paper);
  assert.equal(result.state, "placed", result.error); assert.equal(result.rectangle.y, 10);
  assert.equal(result.rows[0].transform[5], 10); assert.equal(result.rows[0].pageOrdinal, 2);
  assert.equal(result.rows[0].referenceBoxes, references);
  assert.deepEqual({ drawing, prepared, inventory }, before);
  assert.equal(restrictDrawingLayout(drawing, { ...prepared, rows: [{ ...prepared.rows[0], section: 1 }] }, inventory, references.paper).error, "AmbiguousRestrictedDrawingRows");
});
