import test from "node:test";
import assert from "node:assert/strict";
import { nestedParagraphReference } from "../../web/preview/nested-paragraph-reference.mjs";
import { positionNestedFloatingTable } from "../../web/preview/nested-floating-table-position.mjs";

test("floating paragraph reference uses covered current rows rather than flow height", () => {
  const paragraph = { section: 0, paragraph: 3, text: "😀" };
  const row = { kind: "text", section: 0, paragraph: 3, startUnit: 0, endUnit: 2, text: "😀", x: 0, y: 0, width: 200, textHeight: 16, textTop: 0, height: 300 };
  const flow = { rows: [row], height: 351 };
  const origin = { x: 50, y: 200 };
  const before = structuredClone(flow);
  const reference = nestedParagraphReference(paragraph, flow, origin);
  assert.deepEqual(reference, { state: "referenced", rectangle: { section: 0, paragraph: 3, x: 50, y: 200, width: 200, height: 16 } });
  const table = { section: 0, tableNode: 2, parentTableNode: 1, parentListNode: 11, hostParagraph: 3, sourceGeometry: { geometry: { treat_as_character: false, width: 1500, height: 7500, width_relative: 4, height_relative: 2, horizontal_offset: 0, vertical_offset: 0 }, text_wrap: 2, vertical_relative: 2, horizontal_relative: 3, vertical_alignment: 2, horizontal_alignment: 0 } };
  const positioned = positionNestedFloatingTable(table, { section: 0, tableNode: 1, listNode: 11, x: 50, y: 100, width: 200, height: 351 }, reference.rectangle, { paper: { x: 0, y: 0, width: 600, height: 800 } });
  assert.equal(positioned.rectangle.y, 116);
  for (const change of [{ text: "wrong" }, { endUnit: 1 }, { textHeight: NaN }, { transform: [1, 0, 0, 1, 0, 0] }]) assert.equal(nestedParagraphReference(paragraph, { rows: [{ ...row, ...change }] }, origin).state, "unavailable");
  assert.equal(nestedParagraphReference(paragraph, { rows: [row, row] }, origin).error, "IncompleteNestedParagraphReference");
  assert.deepEqual(flow, before);
});
