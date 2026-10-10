export function validateHwp5DrawingRectangleCorners(rows) {
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingRectangleCorners");
  const components = new Set(), rectangles = new Set();
  for (const row of rows) {
    if (!row || !uint(row.component_node) || !uint(row.rectangle_node) || row.component_node >= row.rectangle_node
      || !uint(row.round_rate) || row.round_rate > 255 || !Array.isArray(row.points) || row.points.length !== 4
      || !Array.from(row.points).every(point => Array.isArray(point) && point.length === 2 && Array.from(point).every(Number.isFinite))
      || components.has(row.component_node) || rectangles.has(row.rectangle_node)) throw new Error("InvalidHwp5DrawingRectangleCorners");
    components.add(row.component_node); rectangles.add(row.rectangle_node);
    if (Object.hasOwn(row, "raw_points") && (!Array.isArray(row.raw_points) || row.raw_points.length !== 4
      || !Array.from(row.raw_points).every(point => Array.isArray(point) && point.length === 2
        && Array.from(point).every(value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647)))) throw new Error("InvalidHwp5DrawingRectangleCorners");
  }
  return rows;
}
export function decodeHwp5DrawingRectangleCorners(bytes) {
  return validateHwp5DrawingRectangleCorners(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
