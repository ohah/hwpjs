export function validateHwp5DrawingLocalTransforms(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingLocalTransforms");
  const seen = new Set();
  for (const row of rows) {
    if (
      !row ||
      !uint(row.component_node) ||
      !uint(row.owner_node) ||
      row.owner_node >= row.component_node ||
      !Array.isArray(row.matrix) ||
      row.matrix.length !== 6 ||
      !Array.from(row.matrix).every(Number.isFinite) ||
      seen.has(row.component_node)
    )
      throw new Error("InvalidHwp5DrawingLocalTransforms");
    seen.add(row.component_node);
  }
  return rows;
}
export function decodeHwp5DrawingLocalTransforms(bytes) {
  return validateHwp5DrawingLocalTransforms(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
