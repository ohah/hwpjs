import { clipChartLineSegment } from './chart-line-clip.mjs';
export const unavailable = (reason) => ({ state: 'unavailable', reason });
export const familyWarnings = ['SourceStylesNotApplied', 'PreviewFamilyGeometryApproximation'];
export const finitePoint = (p) => p && [p.x, p.y].every(Number.isFinite);
// Intersect a preview polygon with each plot half-plane. Coordinates are derived only.
export function clipFamilyPolygon(input) {
  if (!input.every(finitePoint)) return null;
  let points = input.map((p) => ({ x: p.x, y: p.y }));
  for (const [axis, edge, sign] of [
    ['x', 0, 1],
    ['x', 1, -1],
    ['y', 0, 1],
    ['y', 1, -1],
  ]) {
    const output = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const da = (a[axis] - edge) * sign,
        db = (b[axis] - edge) * sign;
      if (da >= 0) output.push(a);
      if (da < 0 !== db < 0) {
        const magnitude = Math.max(Math.abs(da), Math.abs(db));
        const t = da / magnitude / (da / magnitude - db / magnitude);
        const intersection = { x: a.x * (1 - t) + b.x * t, y: a.y * (1 - t) + b.y * t };
        intersection[axis] = edge;
        output.push(intersection);
      }
    }
    points = output;
  }
  return points.every(finitePoint) ? points : null;
}
export function familyGeometry(kind) {
  return { kind, polygons: [], strokes: [], circles: [], sectors: [] };
}
export function addFamilyPolygon(g, points, series_node, meta = {}) {
  const clipped = clipFamilyPolygon(points);
  if (clipped === null) return false;
  if (clipped.length >= 3) g.polygons.push({ points: clipped, series_node, ...meta });
  return true;
}
export function addFamilyStroke(g, a, b, series_node) {
  if (!finitePoint(a) || !finitePoint(b)) return false;
  const points = clipChartLineSegment(a, b);
  if (points) g.strokes.push({ points, series_node });
  return true;
}
export function familyBudget(data) {
  return data.series.length * data.indices.length <= 16384;
}
// Settings absent in HEAD's Native DTO must never be reconstructed from plot kind.
export function requireFamilyFields(settings, names) {
  const missing = names.filter((key) => !Object.hasOwn(settings ?? {}, key));
  return missing.length
    ? { state: 'unavailable', reason: 'MissingNativeChartFamilySettings', required_fields: missing }
    : null;
}
