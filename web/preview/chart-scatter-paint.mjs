import { clipChartSegment } from './chart-segment-clip.mjs';
import { paintChartMarker } from './chart-marker-paint.mjs';
import { validChartCurvePaths } from './chart-curve-paths.mjs';
/** Plot-clipped XY straight/cubic paths and explicitly labelled preview markers. */
export function paintChartScatter(ctx, scatter, plot, x, y, color) {
  const pixels = (segment) => [
    segment.start.x * plot.width + x,
    segment.start.y * plot.height + y,
    segment.control1.x * plot.width + x,
    segment.control1.y * plot.height + y,
    segment.control2.x * plot.width + x,
    segment.control2.y * plot.height + y,
    segment.end.x * plot.width + x,
    segment.end.y * plot.height + y,
  ];
  for (const row of scatter.rows) {
    if (['smooth', 'smoothMarker'].includes(scatter.style) && row.curves === undefined)
      return false;
    if (row.curves !== null && row.curves !== undefined) {
      if (!validChartCurvePaths(row.curves)) return false;
      for (const path of row.curves)
        for (const segment of path) if (!pixels(segment).every(Number.isFinite)) return false;
    }
  }
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, plot.width, plot.height);
    ctx.clip();
    ctx.lineWidth = 2;
    for (const row of scatter.rows) {
      ctx.strokeStyle = color(row.series_node);
      ctx.fillStyle = color(row.series_node);
      if (scatter.style !== 'marker') {
        ctx.beginPath();
        if (row.curves)
          for (const path of row.curves) {
            for (const [index, segment] of path.entries()) {
              const values = pixels(segment);
              if (index === 0) ctx.moveTo(values[0], values[1]);
              ctx.bezierCurveTo(...values.slice(2));
            }
          }
        else
          for (let i = 1; i < row.points.length; i++) {
            if (row.points[i].break_before) continue;
            const segment = clipChartSegment(row.points[i - 1], row.points[i]);
            if (!segment) continue;
            const [a, b] = segment;
            ctx.moveTo(x + a.x * plot.width, y + a.y * plot.height);
            ctx.lineTo(x + b.x * plot.width, y + b.y * plot.height);
          }
        ctx.stroke();
      }
      const marker = row.marker ?? {
        symbol: ['line', 'smooth'].includes(scatter.style) ? 'none' : 'circle',
        radius: 3,
      };
      for (const point of row.points) {
        if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) continue;
        paintChartMarker(ctx, marker, x + point.x * plot.width, y + point.y * plot.height);
      }
    }
    return true;
  } finally {
    ctx.restore();
  }
}
