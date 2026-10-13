import test from "node:test";
import assert from "node:assert/strict";
import { reserveNestedFloatingFlow } from "../../web/preview/nested-floating-flow-reservation.mjs";

test("empty-anchor host reserves TOP_AND_BOTTOM extent but not behind overlays", () => {
  const paragraph = { section: 0, paragraph: 3, text: "\ufffc" };
  const flow = { height: 16, rows: [{ kind: "text", section: 0, paragraph: 3, text: "\ufffc", startUnit: 0, endUnit: 1, x: 0, y: 0, width: 200, textHeight: 16, textTop: 0, paragraphReferenceX: 0 }] };
  const table = { section: 0, hostParagraph: 3, anchorUnit: 0, sourceGeometry: { text_wrap: 1, vertical_relative: 2, vertical_alignment: 0, flow_with_text: true, allow_overlap: false, geometry: { height: 7500, vertical_offset: 1500 } } };
  const original = structuredClone({ paragraph, flow, table });
  assert.deepEqual(reserveNestedFloatingFlow(paragraph, flow, [{ table }], { x: 0, y: 40 }), { state: "reserved", bottom: 160 });
  assert.equal(reserveNestedFloatingFlow(paragraph, flow, [{ table: { ...table, sourceGeometry: { ...table.sourceGeometry, text_wrap: 2 } } }], { x: 0, y: 40 }).bottom, 56);
  assert.equal(reserveNestedFloatingFlow(paragraph, flow, [null], { x: 0, y: 0 }).error, "InvalidNestedFloatingFlow");
  assert.equal(reserveNestedFloatingFlow(paragraph, flow, [{ table: { ...table, sourceGeometry: { ...table.sourceGeometry, vertical_alignment: 2 } } }], { x: 0, y: 0 }).error, "UnsupportedNestedFloatingBlockFlow");
  assert.deepEqual({ paragraph, flow, table }, original);
});
