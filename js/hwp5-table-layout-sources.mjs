export function decodeHwp5TableLayoutSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  return validateHwp5TableLayoutSources(rows);
}
export function validateHwp5TableLayoutSources(rows) {
  const uint = (value, max = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= max;
  const signed = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5TableLayoutSources");
  for (const row of rows) {
    if (!row || !["table_node", "table_record_node", "object_flags", "width", "height", "instance_id", "object_extra_bytes", "table_flags", "table_extra_bytes"].every(key => uint(row[key])) || !["offset_y", "offset_x", "z_order", "prevent_page_break"].every(key => signed(row[key], -0x80000000, 0x7fffffff)) || !["rows", "columns", "border_fill_id"].every(key => uint(row[key], 65535)) || !signed(row.cell_spacing, -32768, 32767) || !["outer_margins", "inner_margins"].every(key => Array.isArray(row[key]) && row[key].length === 4 && row[key].every(value => signed(value, -32768, 32767))) || !["description_bytes", "zone_count"].every(key => row[key] === null || uint(row[key])) || row.description_bytes !== null && row.description_bytes % 2 !== 0) throw new Error("InvalidHwp5TableLayoutSources");
  }
  return rows;
}
