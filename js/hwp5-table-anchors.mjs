export function decodeHwp5TableAnchors(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5TableAnchors");
  const seen = new Set();
  for (const row of rows) {
    if (
      !row ||
      !["table_record_node", "control_node", "paragraph", "source_unit", "current_unit"].every(
        (key) => uint(row[key]),
      ) ||
      row.control_node >= row.table_record_node ||
      row.source_unit > 0xfffffff7 ||
      row.current_unit > 0xfffffff7 ||
      seen.has(row.table_record_node)
    )
      throw new Error("InvalidHwp5TableAnchors");
    seen.add(row.table_record_node);
  }
  return rows;
}
