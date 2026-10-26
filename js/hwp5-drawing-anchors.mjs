export function validateHwp5DrawingAnchors(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingAnchors");
  const controls = new Set(),
    components = new Set();
  for (const row of rows) {
    if (
      !row ||
      !["control_node", "component_node", "paragraph", "source_unit", "current_unit"].every((key) =>
        uint(row[key]),
      ) ||
      row.control_node >= row.component_node ||
      row.source_unit > 0xfffffff7 ||
      row.current_unit > 0xfffffff7 ||
      controls.has(row.control_node) ||
      components.has(row.component_node)
    )
      throw new Error("InvalidHwp5DrawingAnchors");
    controls.add(row.control_node);
    components.add(row.component_node);
  }
  return rows;
}
export function decodeHwp5DrawingAnchors(bytes) {
  return validateHwp5DrawingAnchors(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
