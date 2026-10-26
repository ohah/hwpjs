import { countedPointLayoutArg } from "./hwp5-counted-point-layout.mjs";
export function polygonLayoutArg(layout) {
  return countedPointLayoutArg(layout, "InvalidPolygonLayout");
}
export function validateHwp5DrawingPolygonPoints(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const pair = (value, valid) =>
    Array.isArray(value) && value.length === 2 && Array.from(value).every(valid);
  const components = new Set(),
    polygons = new Set();
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingPolygonPoints");
  for (const row of rows) {
    if (
      !row ||
      !uint(row.component_node) ||
      !uint(row.polygon_node) ||
      row.component_node >= row.polygon_node ||
      !uint(row.extra_bytes) ||
      components.has(row.component_node) ||
      polygons.has(row.polygon_node) ||
      !Array.isArray(row.raw_points) ||
      !Array.isArray(row.points) ||
      row.raw_points.length !== row.points.length ||
      !Array.from(row.raw_points).every((p) =>
        pair(p, (n) => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647),
      ) ||
      !Array.from(row.points).every((p) => pair(p, Number.isFinite))
    )
      throw new Error("InvalidHwp5DrawingPolygonPoints");
    components.add(row.component_node);
    polygons.add(row.polygon_node);
  }
  return rows;
}
export function decodeHwp5DrawingPolygonPoints(bytes) {
  return validateHwp5DrawingPolygonPoints(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
