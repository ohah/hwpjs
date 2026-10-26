// Independent raw framing + logical sibling lists; no product tree/model.
import assert from 'node:assert/strict';
import { records } from './text-record-oracle.mjs';
export function tableBindings(bytes) {
  const stack = [],
    tables = new Map(),
    output = [];
  let paragraph = -1;
  for (const [index, record] of records(bytes).entries()) {
    stack.length = record.level;
    const parent = stack[record.level - 1];
    if (record.tag === 66) paragraph++;
    if (record.tag === 71 && record.payload.readUInt32LE(0) === 0x74626c20)
      tables.set(index, { cell: null });
    const table = tables.get(parent);
    if (table) {
      if (record.tag === 77) {
        assert.equal(table.tableNode, undefined);
        table.tableNode = index;
        table.rows = record.payload.readUInt16LE(4);
        table.columns = record.payload.readUInt16LE(6);
      } else if (record.tag === 72) {
        table.cell = null;
        if (table.tableNode !== undefined)
          table.cell = {
            listNode: index,
            row: record.payload.readUInt16LE(10),
            column: record.payload.readUInt16LE(8),
            rowSpan: record.payload.readUInt16LE(14),
            columnSpan: record.payload.readUInt16LE(12),
            width: record.payload.readUInt32LE(16),
            height: record.payload.readUInt32LE(20),
          };
      } else if (record.tag === 66 && table.cell)
        output.push({
          paragraph,
          tableNode: table.tableNode,
          rows: table.rows,
          columns: table.columns,
          ...table.cell,
        });
    }
    stack.push(index);
  }
  return output;
}

export function tablePlacements(bytes) {
  const framed = records(bytes),
    stack = [],
    paragraphs = new Map(),
    output = [];
  const cells = new Map(tableBindings(bytes).map((row) => [row.paragraph, row]));
  let ordinal = -1;
  for (const [index, record] of framed.entries()) {
    stack.length = record.level;
    if (record.tag === 66) paragraphs.set(index, ++ordinal);
    if (record.tag === 77) {
      const header = [...stack].reverse().find((node) => paragraphs.has(node));
      assert.notEqual(header, undefined, 'table without paragraph host');
      const paragraph = paragraphs.get(header),
        parent = cells.get(paragraph);
      output.push({
        tableNode: index,
        paragraph,
        parentTableNode: parent?.tableNode ?? null,
        parentListNode: parent?.listNode ?? null,
      });
    }
    stack.push(index);
  }
  return output;
}
