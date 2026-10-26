export function validateHwp5NoteShapeSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows) || rows.length !== 2) throw new Error("InvalidHwp5NoteShapeSources");
  for (const [index, row] of rows.entries()) {
    if (
      !row ||
      row.kind !== ["footnote", "endnote"][index] ||
      !["source_node", "owner_node", "flags", "color", "extra_bytes"].every((key) =>
        integer(row[key], 0, 0xffffffff),
      ) ||
      row.owner_node >= row.source_node ||
      !["user_char", "prefix", "suffix", "start_number"].every((key) =>
        integer(row[key], 0, 65535),
      ) ||
      !integer(row.separator_length, -2147483648, 2147483647) ||
      !["above", "below", "between"].every((key) => integer(row[key], -32768, 32767)) ||
      !["line_type", "line_width"].every((key) => integer(row[key], 0, 255)) ||
      typeof row.extra_nonzero !== "boolean" ||
      (row.extra_bytes === 0 && row.extra_nonzero)
    )
      throw new Error("InvalidHwp5NoteShapeSources");
  }
  if (rows[0].owner_node !== rows[1].owner_node || rows[0].source_node >= rows[1].source_node)
    throw new Error("InvalidHwp5NoteShapeSources");
  return rows;
}
export function decodeHwp5NoteShapeSources(bytes) {
  return validateHwp5NoteShapeSources(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
