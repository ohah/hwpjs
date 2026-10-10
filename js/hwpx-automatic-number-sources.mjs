export function decodeAutomaticNumberSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const flag = v => v === null || typeof v === "boolean";
  const raw = (v, n) => Array.isArray(v) && v.length === n && v.every(s => s === null || typeof s === "string");
  const nodes = new Set();
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error("InvalidAutomaticNumberSources");
  for (const row of rows) {
    const value = row?.values, format = row?.format;
    if (!object(row) || !uint(row.number_node) || nodes.has(row.number_node) || !(row.anchor_node === null || uint(row.anchor_node)) || !object(value) || !raw(value.raw, 2) || !uint(value.other_attributes) || !flag(value.type_known) || !(value.num === null || Number.isInteger(value.num) && value.num >= -0x80000000 && value.num <= 0x7fffffff) || !(format === null || object(format) && raw(format.raw, 5) && uint(format.other_attributes) && flag(format.type_known) && flag(format.supscript))) throw new Error("InvalidAutomaticNumberSources");
    nodes.add(row.number_node);
  }
  return rows;
}
