import test from "node:test";
import assert from "node:assert/strict";
import { attachCreatedTableFlow } from "../../web/preview/created-table-flow.mjs";
import { sameParagraph, paragraphTarget, hitText, caretGeometry, selectionRects } from "../../web/preview/text-geometry.mjs";
const point = (identity, row = 0, column = 0) => ({ section: 0, createdCell: { identity, row, column } });
test("generated cell geometry keeps identity row and column out of source paragraph namespace", () => {
  assert.equal(sameParagraph(point("1"), point("2")), false);
  assert.equal(sameParagraph(point("1"), point("1", 1)), false);
  assert.equal(sameParagraph(point("1"), point("1", 0, 1)), false);
  assert.equal(sameParagraph(point("1"), { section: 0, paragraph: 1 }), false);
  assert.equal(sameParagraph(point("1"), point("1")), true);
  assert.deepEqual(paragraphTarget({ ...point("9007199254740993"), unit: 3 }), point("9007199254740993"));
});
test("generated cell blank clicks and caret selection resolve only the matching owner", () => {
  const table = { section: 0, identity: "9007199254740993", hostParagraph: 0, anchorUnit: 0, rows: 1, columns: 2, resources: { character: 1 }, cells: [0, 1].map(column => ({ row: 0, column, width: 7200, height: 1000, text: column ? "" : "가😀" })) };
  const base = { height: 28, rows: [{ section: 0, paragraph: 0, kind: "text", y: 0, height: 28, width: 200, text: "host" }], boxes: [] };
  const flow = attachCreatedTableFlow({ createdTables: [table] }, base, text => ({ width: [...text].length * 8, height: 16 }));
  const blank = flow.boxes[1];
  const hit = hitText(flow, blank.x + 2, blank.y + 2);
  assert.equal(hit.createdCell.column, 1);
  assert.equal(hit.paragraph, undefined);
  assert.equal(caretGeometry(flow, { ...point(table.identity, 0, 0), unit: 2 }), null);
  assert(caretGeometry(flow, { ...point(table.identity, 0, 0), unit: 3 }));
  const rects = selectionRects(flow, { ...point(table.identity), unit: 0 }, { ...point(table.identity), unit: 3 });
  assert.equal(rects.length, 1);
  assert(rects[0].x < blank.x);
});
