/** Source commands/caches, not current evaluation or mutable model handles. */
export function decodeFormulaSources(bytes, { current = false } = {}) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 4096) throw new Error("InvalidFormulaSources");
  let previous = -1;
  for (const row of rows) {
    if (!row || !Number.isInteger(row.begin_element) || row.begin_element <= previous || row.begin_element > 0xffffffff || !row.values || !["command", "formula", "result_format", "last_result"].every(key => row.values[key] === null || typeof row.values[key] === "string")) throw new Error("InvalidFormulaSources");
    previous = row.begin_element;
    if (current) {
      const owner = row.owner;
      const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
      if (!owner || ![owner.table, owner.cell, owner.columns, owner.rows, owner.origin?.column, owner.origin?.row].every(uint) || owner.columns === 0 || owner.rows === 0 || owner.origin.column >= owner.columns || owner.origin.row >= owner.rows) throw new Error("InvalidFormulaSources");
    }
  }
  return rows;
}
