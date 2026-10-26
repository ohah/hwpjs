const code = (p) => (p.x < 0 ? 1 : p.x > 1 ? 2 : 0) | (p.y < 0 ? 4 : p.y > 1 ? 8 : 0);
/** Unit-square clipping before pixel multiplication, with bounded iteration. */
export function clipChartSegment(a, b) {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  if (a.y > b.y || (a.y === b.y && a.x > b.x)) return clipChartSegment(b, a)?.reverse() ?? null;
  a = { x: a.x, y: a.y };
  b = { x: b.x, y: b.y };
  for (let i = 0; i < 16; i++) {
    const first = code(a),
      last = code(b);
    if (!(first | last)) return [a, b];
    if (first & last) return null;
    const outside = first || last,
      vertical = Boolean(outside & 12),
      axis = vertical ? "y" : "x",
      other = vertical ? "x" : "y";
    const boundary = outside & (vertical ? 4 : 1) ? 0 : 1;
    const magnitude = Math.max(Math.abs(a[axis]), Math.abs(b[axis]), 1);
    const fraction =
      (boundary / magnitude - a[axis] / magnitude) / (b[axis] / magnitude - a[axis] / magnitude);
    const value = a[other] * (1 - fraction) + b[other] * fraction;
    if (!Number.isFinite(fraction) || !Number.isFinite(value)) return null;
    const point = { [axis]: boundary, [other]: value };
    if (first) a = point;
    else b = point;
  }
  return null;
}
