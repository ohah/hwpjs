export function validateHwp5CaptionSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5CaptionSources");
  const lists = new Set(),
    owners = new Map();
  for (const row of rows) {
    if (
      !row ||
      ![
        "control_node",
        "table_record_node",
        "list_node",
        "attributes",
        "flags",
        "width",
        "max_text_width",
        "extra_bytes",
      ].every((key) => integer(row[key], 0, 0xffffffff)) ||
      !(row.control_node < row.list_node && row.list_node < row.table_record_node) ||
      !integer(row.paragraph_count, 0, 65535) ||
      (row.unknown !== null && !integer(row.unknown, 0, 65535)) ||
      !integer(row.gap, -32768, 32767) ||
      typeof row.extra_nonzero !== "boolean" ||
      (row.extra_bytes === 0 && row.extra_nonzero) ||
      lists.has(row.list_node) ||
      (owners.has(row.control_node) && owners.get(row.control_node) !== row.table_record_node)
    )
      throw new Error("InvalidHwp5CaptionSources");
    lists.add(row.list_node);
    owners.set(row.control_node, row.table_record_node);
  }
  return rows;
}
export function decodeHwp5CaptionSources(bytes) {
  return validateHwp5CaptionSources(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
