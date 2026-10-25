import { clipChartSegment } from "./chart-segment-clip.mjs";
/** Category coordinates are bounded; the shared clip owns intersection math. */
export function clipChartLineSegment(a, b) {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || a.x < 0 || a.x > 1 || b.x < 0 || b.x > 1) return null;
  return clipChartSegment(a, b);
}
