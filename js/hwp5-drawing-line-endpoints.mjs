export function validateHwp5DrawingLineEndpoints(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const pair = (value, valid) =>
    Array.isArray(value) &&
    value.length === 2 &&
    Array.from(value).every(
      (point) => Array.isArray(point) && point.length === 2 && Array.from(point).every(valid),
    );
  const components = new Set(),
    lines = new Set();
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingLineEndpoints");
  for (const row of rows) {
    if (
      !row ||
      ![row.component_node, row.owner_node, row.line_node, row.attributes, row.extra_bytes].every(
        uint,
      ) ||
      row.owner_node >= row.component_node ||
      row.component_node >= row.line_node ||
      row.attributes > 65535 ||
      typeof row.extra_nonzero !== "boolean" ||
      (row.extra_bytes === 0 && row.extra_nonzero) ||
      !pair(row.points, Number.isFinite) ||
      !pair(
        row.raw_points,
        (value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647,
      ) ||
      components.has(row.component_node) ||
      lines.has(row.line_node)
    )
      throw new Error("InvalidHwp5DrawingLineEndpoints");
    components.add(row.component_node);
    lines.add(row.line_node);
  }
  return rows;
}
export function decodeHwp5DrawingLineEndpoints(bytes) {
  return validateHwp5DrawingLineEndpoints(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
