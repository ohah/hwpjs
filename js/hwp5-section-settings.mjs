export function decodeHwp5SectionSettings(bytes) {
  const row = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value, max = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!row || !["source_node", "flags", "tab_spacing", "extra_bytes"].every(key => uint(row[key])) || !["column_gap", "vertical_grid", "horizontal_grid"].every(key => Number.isInteger(row[key]) && row[key] >= -32768 && row[key] <= 32767) || !["numbering_id", "page_start", "picture_start", "table_start", "equation_start"].every(key => uint(row[key], 65535)) || !(row.language === null || uint(row.language, 65535)) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero) throw new Error("InvalidHwp5SectionSettings");
  if (Object.hasOwn(row, "extra_raw") && (!Array.isArray(row.extra_raw) || row.extra_raw.length !== row.extra_bytes
    || !Array.from(row.extra_raw).every(byte => uint(byte, 255)) || row.extra_raw.some(byte => byte !== 0) !== row.extra_nonzero)) throw new Error("InvalidHwp5SectionSettings");
  return row;
}
