export function decodeFormulaFieldSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const optionalBoolean = value => value === null || typeof value === "boolean";
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error("InvalidFormulaFieldSources");
  const begins = new Set(), ends = new Set();
  for (const row of rows) {
    if (!row || !uint(row.begin_node) || !uint(row.end_node) || row.end_node <= row.begin_node || begins.has(row.begin_node) || ends.has(row.end_node) || !optionalBoolean(row.editable) || !optionalBoolean(row.dirty) || !Array.isArray(row.raw) || row.raw.length !== 5 || row.raw.some(value => value !== null && (typeof value !== "string" || !value.isWellFormed()))) throw new Error("InvalidFormulaFieldSources");
    begins.add(row.begin_node); ends.add(row.end_node);
  }
  return rows;
}
