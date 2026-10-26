import { clipChartLineSegment } from "./chart-line-clip.mjs";
import { paintChartMarker } from "./chart-marker-paint.mjs";
/** Plot-clipped straight preview strokes; never persists derived coordinates. */
export function paintChartLines(ctx, lines, plot, x, y, color) {
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, plot.width, plot.height);
    ctx.clip();
    ctx.lineWidth = 2;
    for (const line of lines) {
      ctx.strokeStyle = color(line.series_node);
      ctx.fillStyle = color(line.series_node);
      for (const path of line.paths) {
        if (path.length < 2) continue;
        ctx.beginPath();
        for (let i = 1; i < path.length; i++) {
          const segment = clipChartLineSegment(path[i - 1], path[i]);
          if (!segment) continue;
          const [start, end] = segment;
          ctx.moveTo(x + start.x * plot.width, y + start.y * plot.height);
          ctx.lineTo(x + end.x * plot.width, y + end.y * plot.height);
        }
        ctx.stroke();
      }
      if (line.marker)
        for (const path of line.paths)
          for (const point of path) {
            if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) continue;
            paintChartMarker(ctx, line.marker, x + point.x * plot.width, y + point.y * plot.height);
          }
    }
  } finally {
    ctx.restore();
  }
}
