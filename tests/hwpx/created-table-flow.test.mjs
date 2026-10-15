import test from "node:test";
import assert from "node:assert/strict";
import { attachCreatedTableFlow, createdCellParagraph } from "../../web/preview/created-table-flow.mjs";
import { rowAtPoint } from "../../web/preview/row-geometry.mjs";
const base = { height: 56, rows: [0, 1].map(paragraph => ({ section: 0, paragraph, y: paragraph * 28, x: 20, kind: "text", text: "host", height: 28, width: 200, editable: true, boundaries: [{ unit: 0, x: 0 }, { unit: 4, x: 32 }] })), boxes: [] };
const table = hostParagraph => ({ section: 0, identity: `${hostParagraph + 1}`, hostParagraph, anchorUnit: 0, rows: 1, columns: 1, resources: { character: 1 }, cells: [{ row: 0, column: 0, width: 7200, height: 1000, text: "셀😀" }] });
const measure = text => ({ width: [...text].length * 8, height: 16 });
test("created table document flow shifts later rows clips and retains stable identity views", () => {
  const before = structuredClone(base);
  const flow = attachCreatedTableFlow({ createdTables: [table(1), table(0)] }, base, measure);
  assert.equal(flow.boxes.length, 2);
  assert(flow.rows.find(row => row.paragraph === 0).y > 0);
  assert.equal(flow.rows.filter(row => row.createdCell).length, 2);
  for (const row of flow.rows.filter(row => row.createdCell)) {
    assert.equal(row.pageClip.y + 6, row.y);
    assert.equal(createdCellParagraph(flow, row).text, "셀😀");
    assert.equal(row.editable, true);
  }
  assert.deepEqual(base, before);
});
test("unsupported nested host stays diagnosed and generated boxes never select a source row", () => {
  const nested = { ...base, rows: base.rows.map(row => ({ ...row, tableNode: 9 })) };
  const result = attachCreatedTableFlow({ createdTables: [table(0)] }, nested, measure);
  assert.equal(result.createdTableUnavailable[0].error, "UnsupportedCreatedTableHostLayout");
  const flow = attachCreatedTableFlow({ createdTables: [table(0)] }, base, measure);
  const box = flow.boxes[0];
  const index = rowAtPoint(flow, box.x + 2, box.y + 2);
  assert.equal(flow.rows[index].createdCell.identity, box.createdCell.identity);
  assert.equal(attachCreatedTableFlow({ createdTables: [] }, base, measure), base);
});

test("generated tables after one host keep anchor order and stable equal-anchor ownership", () => {
  const tables = [
    { ...table(0), identity: "9", anchorUnit: 3 },
    { ...table(0), identity: "2", anchorUnit: 1 },
    { ...table(0), identity: "7", anchorUnit: 3 },
  ];
  const before = structuredClone({ base, tables });
  const result = attachCreatedTableFlow({ createdTables: tables }, base, measure);
  const ordered = [...result.boxes].sort((a, b) => a.y - b.y);
  assert.deepEqual(ordered.map(box => box.createdCell.identity), ["2", "9", "7"]);
  for (let i = 1; i < ordered.length; i++) assert(ordered[i].y >= ordered[i - 1].y + ordered[i - 1].height);
  for (const box of ordered) {
    const row = result.rows[rowAtPoint(result, box.x + 2, box.y + 2)];
    assert.equal(row.createdCell.identity, box.createdCell.identity);
    assert.equal(row.pageClip.y, box.y);
  }
  assert.deepEqual({ base, tables }, before);
});
