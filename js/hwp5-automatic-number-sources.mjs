export function validateHwp5AutomaticNumberSources(rows) {
  const uint = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5AutomaticNumberSources");
  const seen = new Set(),
    positions = new Set();
  for (const row of rows) {
    if (
      !row ||
      ![
        "control_node",
        "paragraph",
        "source_unit",
        "current_unit",
        "attributes",
        "extra_bytes",
      ].every((key) => uint(row[key], 0xffffffff)) ||
      row.source_unit > 0xfffffff7 ||
      row.current_unit > 0xfffffff7 ||
      !["number", "symbol", "prefix", "suffix"].every((key) => uint(row[key], 65535)) ||
      row.kind !== (row.attributes & 15) ||
      row.shape !== ((row.attributes >>> 4) & 255) ||
      row.superscript !== Boolean(row.attributes & 4096) ||
      typeof row.extra_nonzero !== "boolean" ||
      (row.extra_bytes === 0 && row.extra_nonzero) ||
      seen.has(row.control_node)
    )
      throw new Error("InvalidHwp5AutomaticNumberSources");
    const position = `${row.paragraph}:${row.current_unit}`;
    if (positions.has(position)) throw new Error("InvalidHwp5AutomaticNumberSources");
    seen.add(row.control_node);
    positions.add(position);
  }
  return rows;
}
export function decodeHwp5AutomaticNumberSources(bytes) {
  return validateHwp5AutomaticNumberSources(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
