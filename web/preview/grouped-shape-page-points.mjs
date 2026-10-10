/** renderingInfo corners already use the root group coordinate system. */
export function groupedShapePagePoints(corners, origin, unitScale) {
  if (!Array.isArray(corners) || corners.length !== 4 || !Array.from(corners).every(p => Array.isArray(p) && p.length === 2 && Array.from(p).every(Number.isFinite))
    || !Array.isArray(origin) || origin.length !== 2 || !Array.from(origin).every(Number.isFinite) || !Number.isFinite(unitScale) || unitScale <= 0) throw new Error("InvalidGroupedShapeProjection");
  const result = corners.map(p => [origin[0] + p[0] * unitScale, origin[1] + p[1] * unitScale]);
  if (!result.every(p => p.every(Number.isFinite))) throw new Error("InvalidGroupedShapeProjection");
  return result;
}
