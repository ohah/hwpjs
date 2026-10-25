// Singular values of the two radius columns, without squaring large inputs.
// The resulting orthogonal basis describes the same ellipse, not its bounding box.
export function ellipsePrincipalAxes(u, v) {
  if (![u, v].every(a => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite))) return null;
  const scale = Math.max(...u.map(Math.abs), ...v.map(Math.abs));
  if (!(scale > 0)) return null;
  const [a, b] = u.map(n => n / scale), [c, d] = v.map(n => n / scale);
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || determinant === 0) return null;
  const xx = a * a + c * c, xy = a * b + c * d, yy = b * b + d * d;
  const major = Math.sqrt((xx + yy + Math.hypot(xx - yy, 2 * xy)) / 2);
  const rx = scale * major, ry = scale * Math.abs(determinant) / major;
  const rotation = Math.atan2(2 * xy, xx - yy) / 2;
  return [rx, ry, rotation].every(Number.isFinite) && rx > 0 && ry > 0 ? { rx, ry, rotation } : null;
}
