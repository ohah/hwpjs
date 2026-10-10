// Fixture-scoped independent table/cell arithmetic, not product model code.
import assert from "node:assert/strict";
import { records } from "./text-record-oracle.mjs";
import { generalNumber } from "./general-number-oracle.mjs";

function chartTables(bytes) {
  let table, cell, paragraph, paragraphIndex = -1;
  const tables = [];
  for (const record of records(bytes)) {
    if (record.tag === 66) paragraphIndex++;
    if (table && record.level <= table.level) { table = undefined; cell = undefined; }
    if (record.tag === 71 && record.payload.readUInt32LE(0) === 0x74626c20) {
      table = { level: record.level, cells: new Map(), formulas: [] }; tables.push(table);
    }
    if (!table) continue;
    if (record.tag === 72 && record.level === table.level + 1) {
      cell = undefined;
      if (record.payload.length !== 47) continue; // observed chart cell, not caption
      const declared = record.payload.readUInt16LE(0);
      assert(declared >= 1);
      assert.equal(record.payload.readUInt16LE(12), 1);
      assert.equal(record.payload.readUInt16LE(14), 1);
      cell = { column: record.payload.readUInt16LE(8), row: record.payload.readUInt16LE(10), declared, paragraphs: [] };
      const key = `${cell.column},${cell.row}`;
      assert(!table.cells.has(key)); table.cells.set(key, cell);
    }
    if (record.tag === 66 && record.level === table.level + 1) {
      paragraph = cell ? { index: paragraphIndex } : undefined;
      if (cell) cell.paragraphs.push(paragraph);
    }
    if (record.tag === 67 && record.level === table.level + 2 && paragraph) paragraph.text = record.payload;
    if (record.tag === 71 && record.payload.readUInt32LE(0) === 0x25666d75) {
      assert(cell && cell.paragraphs.includes(paragraph));
      const length = record.payload.readUInt16LE(9);
      const command = record.payload.subarray(11, 11 + length * 2).toString("utf16le");
      const match = /^=(SUM|AVG|MIN|MAX)\(([A-Z?]+)([0-9?]+):([A-Z?]+)([0-9?]+)\)\?\?(%g|%\.2f),;;(.+)$/.exec(command);
      assert(match, command); table.formulas.push({ cell, match });
    }
  }
  for (const table of tables) for (const cell of table.cells.values()) assert.equal(cell.paragraphs.length, cell.declared);
  return tables;
}

const column = value => [...value].reduce((sum, c) => sum * 26 + c.charCodeAt(0) - 64, 0) - 1;
function bounds(cell, match) {
  return { left: match[2] === "?" ? cell.column : column(match[2]), top: match[3] === "?" ? cell.row : Number(match[3]) - 1,
    right: match[4] === "?" ? cell.column : column(match[4]), bottom: match[5] === "?" ? cell.row : Number(match[5]) - 1 };
}

// Fixture-scoped ownership inventory independent of the native model/policy.
export function chartNumericTargets(bytes) {
  const targets = new Set();
  for (const table of chartTables(bytes)) {
    const results = new Set(table.formulas.map(field => field.cell));
    for (const { cell, match } of table.formulas) {
      const { left, top, right, bottom } = bounds(cell, match);
      for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
        const dependency = table.cells.get(`${col},${row}`);
        assert(dependency && !results.has(dependency), "fixture numeric dependency must not be a derived result");
        assert.equal(dependency.paragraphs.length, 1);
        targets.add(dependency.paragraphs[0].index);
      }
    }
  }
  return [...targets].sort((a, b) => a - b);
}

export function chartStructureTargets(bytes) {
  const allowed = [], protectedParagraphs = [];
  for (const table of chartTables(bytes)) {
    const protectedCells = new Set(table.formulas.map(field => field.cell));
    for (const { cell, match } of table.formulas) {
      const { left, top, right, bottom } = bounds(cell, match);
      for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
        const dependency = table.cells.get(`${col},${row}`);
        assert(dependency); protectedCells.add(dependency);
      }
    }
    for (const cell of table.cells.values()) for (const paragraph of cell.paragraphs)
      (protectedCells.has(cell) ? protectedParagraphs : allowed).push(paragraph.index);
  }
  return { allowed, protectedParagraphs };
}

export function verifyChartFormulas(bytes) {
  const tables = chartTables(bytes);
  let count = 0;
  for (const table of tables) for (const { cell, match } of table.formulas) {
    const { left, top, right, bottom } = bounds(cell, match);
    const values = [];
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      const referenced = table.cells.get(`${col},${row}`);
      assert.equal(referenced?.paragraphs.length, 1, "referenced cell became multi-paragraph");
      const raw = referenced.paragraphs[0].text;
      assert(raw, "missing referenced cell");
      const text = raw.toString("utf16le").replace(/\r$/, "").replaceAll(",", "");
      assert.match(text, /^-?\d+(?:\.\d+)?$/); values.push(Number(text));
    }
    assert(values.length > 0);
    const value = match[1] === "MIN" ? Math.min(...values) : match[1] === "MAX" ? Math.max(...values) : values.reduce((sum, v) => sum + v, 0) / (match[1] === "AVG" ? values.length : 1);
    const rendered = match[6] === "%.2f" ? value.toFixed(2) : generalNumber(value);
    const cached = match[7].replaceAll(",", "");
    assert.equal(cached, rendered, "independent arithmetic differs from command");
    assert.equal(cell.paragraphs.length, 1, "formula result cell became multi-paragraph");
    assert.equal(cell.paragraphs[0].text.subarray(16, -18).toString("utf16le").replaceAll(",", ""), rendered, "independent arithmetic differs from label");
    count++;
  }
  assert.equal(count, 13); return count;
}
