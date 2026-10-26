import { hwpUnitPixels } from "./hwp-units.mjs";

// Source coordinates already include renderingInfo. Only translate and convert units.
export function drawingPathPoints(source, origin, scrollTop = 0) {
  const polygon = source?.rendering_polygon;
  const points = polygon === undefined ? source?.rendering_corners : polygon;
  if (
    !Array.isArray(points) ||
    (polygon === undefined ? points.length !== 4 : points.length < 2) ||
    !Array.from(points).every(
      (p) => Array.isArray(p) && p.length === 2 && Array.from(p).every(Number.isFinite),
    ) ||
    ![origin?.x, origin?.y, scrollTop].every(Number.isFinite)
  )
    return null;
  if (
    polygon !== undefined &&
    points.length === 2 &&
    (source.polygon_closed !== false ||
      (points[0][0] === points[1][0] && points[0][1] === points[1][1]))
  )
    return null;
  const transformed = points.map(([x, y]) => [
    origin.x + hwpUnitPixels(x),
    origin.y + hwpUnitPixels(y) - scrollTop,
  ]);
  if (
    polygon !== undefined &&
    transformed.length === 2 &&
    transformed[0][0] === transformed[1][0] &&
    transformed[0][1] === transformed[1][1]
  )
    return null;
  return transformed.flat().every(Number.isFinite) ? transformed : null;
}

export function traceDrawingPath(ctx, points, closed = true) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  if (closed) ctx.closePath();
}
