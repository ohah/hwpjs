export function decodeCreatedTables(bytes) {
  const fail = () => { throw new Error("InvalidCreatedTables"); };
  if (!(bytes instanceof Uint8Array)) return fail();
  let rows;
  try { rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(); }
  if (!Array.isArray(rows) || rows.length > 100000) return fail();
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const keys = (value, names) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
  const identities = new Set(), instances = new Set(), paragraphs = new Set();
  for (const row of rows) {
    if (!keys(row, ["identity", "instance_id", "host_paragraph", "anchor_unit", "rows", "columns", "width", "height", "resources", "cells"])) return fail();
    if (typeof row.identity !== "string" || !/^[1-9][0-9]{0,19}$/.test(row.identity) || BigInt(row.identity) > 18446744073709551615n || identities.has(row.identity)) return fail();
    identities.add(row.identity);
    if (![row.instance_id, row.host_paragraph, row.anchor_unit, row.rows, row.columns, row.width, row.height].every(uint) || !row.instance_id || !row.host_paragraph || !row.rows || !row.columns || row.width < row.columns || row.height < row.rows || row.height % row.rows || instances.has(row.instance_id)) return fail();
    instances.add(row.instance_id);
    if (!keys(row.resources, ["paragraph", "character", "style", "border_fill"]) || !Object.values(row.resources).every(uint)) return fail();
    const count = row.rows * row.columns;
    if (count > 100000 || !Array.isArray(row.cells) || row.cells.length !== count) return fail();
    const height = row.height / row.rows;
    let x = 0;
    for (let index = 0; index < count; index++) {
      const cell = row.cells[index];
      if (!keys(cell, ["paragraph_id", "row", "column", "x", "y", "width", "height", "text"]) || ![cell.paragraph_id, cell.row, cell.column, cell.x, cell.y, cell.width, cell.height].every(uint)) return fail();
      if (!cell.paragraph_id || paragraphs.has(cell.paragraph_id) || cell.row !== Math.floor(index / row.columns) || cell.column !== index % row.columns || cell.x !== x || !cell.width || cell.height !== height || cell.y !== cell.row * height || typeof cell.text !== "string" || !cell.text.isWellFormed()) return fail();
      paragraphs.add(cell.paragraph_id);
      x += cell.width;
      if (x > row.width) return fail();
      if (cell.column === row.columns - 1) { if (x !== row.width) return fail(); x = 0; }
    }
  }
  return rows;
}
