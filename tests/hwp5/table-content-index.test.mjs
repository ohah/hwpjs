import test from "node:test";
import assert from "node:assert/strict";
import { attachTables } from "../../web/preview/table-content.mjs";

test("table grouping keeps cell lookups linear without changing first-binding geometry or paragraph order", () => {
  const count = 1000;
  let reads = 0;
  const bindings = Array.from({ length: count }, (_, paragraph) => ({
    paragraph, tableNode: 9, get listNode() { reads++; return paragraph + 100; },
    rows: count, columns: 1, row: paragraph, column: 0, rowSpan: 1, columnSpan: 1, width: 300, height: 20,
  }));
  const content = { paragraphs: bindings.map((_, paragraph) => ({ section: 0, paragraph, editable: true })) };
  attachTables({ tableBindings: () => bindings }, { sections: [{ index: 0 }] }, content);
  assert(reads <= count * 4, `CellLookupMustBeLinear: ${reads}`);
  assert.equal(content.tables.length, 1);
  assert.equal(content.tables[0].cells.length, count);
  assert.equal(content.tables[0].partial, false);
  content.tables[0].cells.forEach((cell, index) => {
    assert.equal(cell.listNode, index + 100);
    assert.deepEqual(cell.paragraphs, [index]);
    assert.equal(cell.width, 300);
  });
});

test("table grouping scopes reused list IDs by table and section and retains original first geometry", () => {
  const binding = (paragraph, tableNode, width) => ({ paragraph, tableNode, listNode: 7, rows: 1, columns: 1, row: 0, column: 0, rowSpan: 1, columnSpan: 1, width, height: 20 });
  const source = [binding(0, 10, 100), binding(1, 10, 999), binding(2, 11, 200)];
  const content = { paragraphs: [0, 1].flatMap(section => [0, 1, 2].map(paragraph => ({ section, paragraph }))) };
  attachTables({ tableBindings: () => source }, { sections: [{ index: 0 }, { index: 1 }] }, content);
  assert.equal(content.tables.length, 4);
  for (const section of [0, 1]) {
    const tables = content.tables.filter(row => row.section === section);
    assert.deepEqual(tables.map(row => row.tableNode), [10, 11]);
    assert.equal(tables[0].cells[0].width, 100);
    assert.deepEqual(tables[0].cells[0].paragraphs, [0, 1]);
    assert.equal(tables[1].cells[0].width, 200);
    assert.deepEqual(tables[1].cells[0].paragraphs, [2]);
  }
  attachTables(null, { sections: [] }, content);
  assert.deepEqual(content.tables, []);
  assert(content.paragraphs.every(row => row.tableCell === undefined));
});
