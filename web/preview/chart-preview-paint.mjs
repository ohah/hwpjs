import { chartPreviewTextLayout } from "./chart-preview-text-layout.mjs";
import {
  paintChartPreviewAnnotations,
  paintChartPreviewGrid,
} from "./chart-preview-annotation-paint.mjs";
import { paintChartLines } from "./chart-line-paint.mjs";
import { paintChartScatter } from "./chart-scatter-paint.mjs";
import { validChartMarker } from "./chart-marker-policy.mjs";
import { validChartPie, paintChartPie } from "./chart-pie-paint.mjs";
import { validChartOfPie, paintChartOfPie } from "./chart-of-pie-paint.mjs";
import { validChartStock, paintChartStock } from "./chart-stock-paint.mjs";
import { validChartCurvePaths } from "./chart-curve-paths.mjs";
import { validChartBar3D, paintChartBar3D } from "./chart-bar-3d-paint.mjs";
import { validChartPie3D, paintChartPie3D } from "./chart-pie-3d-paint.mjs";
import { validEmptyCircularPreview } from "./chart-empty-circular.mjs";
const palette = ["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"];
/** Preview colors only. Source chart style, axes and labels are not applied yet. */
export function paintChartPreview(ctx, item, scrollTop, report = () => {}) {
  if (
    !item ||
    ![item.x, item.y, item.width, item.height, scrollTop].every(Number.isFinite) ||
    item.width <= 0 ||
    item.height <= 0 ||
    item.primitives?.state !== "ready"
  )
    return false;
  const bars = item.primitives.bars ?? [],
    lines = item.primitives.lines ?? [];
  const empty = item.primitives.empty_circular;
  if (
    empty !== undefined &&
    (!validEmptyCircularPreview(empty) ||
      bars.length ||
      lines.length ||
      ["pie", "pie_3d", "of_pie", "scatter", "stock", "bar_3d", "categories", "legend"].some(
        (key) => item.primitives[key] !== undefined,
      ))
  )
    return false;
  if (!Array.isArray(bars) || !Array.isArray(lines)) return false;
  if (
    !bars.every(
      ({ rectangle: r }) =>
        r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width >= 0 && r.height >= 0,
    )
  )
    return false;
  if (
    !lines.every(
      (line) =>
        Array.isArray(line.paths) &&
        line.paths.every(
          (path) =>
            Array.isArray(path) &&
            path.every(
              (point) => [point.x, point.y].every(Number.isFinite) && point.x >= 0 && point.x <= 1,
            ),
        ),
    )
  )
    return false;
  if (lines.some((line) => line.marker && !validChartMarker(line.marker))) return false;
  const scatter = item.primitives.scatter;
  if (
    scatter &&
    (!["line", "lineMarker", "marker", "smooth", "smoothMarker"].includes(scatter.style) ||
      !Array.isArray(scatter.rows) ||
      !scatter.rows.every(
        (row) =>
          Array.isArray(row.points) &&
          row.points.every((point) => [point.x, point.y].every(Number.isFinite)),
      ))
  )
    return false;
  if (scatter?.rows.some((row) => row.marker && !validChartMarker(row.marker))) return false;
  if (
    scatter?.rows.some(
      (row) =>
        (row.curves !== null && row.curves !== undefined && !validChartCurvePaths(row.curves)) ||
        (["smooth", "smoothMarker"].includes(scatter.style) && row.curves === undefined),
    )
  )
    return false;
  const pie = item.primitives.pie;
  if (pie && !validChartPie(pie)) return false;
  const pie3d = item.primitives.pie_3d;
  if (pie3d && !validChartPie3D(pie3d)) return false;
  const ofPie = item.primitives.of_pie;
  if (ofPie && !validChartOfPie(ofPie)) return false;
  const stock = item.primitives.stock;
  if (stock && !validChartStock(stock)) return false;
  const bar3d = item.primitives.bar_3d;
  if (bar3d && !validChartBar3D(bar3d)) return false;
  const series = new Map();
  for (const row of item.primitives.legend ?? [])
    if (!series.has(row.series_node)) series.set(row.series_node, series.size);
  for (const row of [...bars, ...lines, ...(scatter?.rows ?? []), ...(bar3d?.faces ?? [])])
    if (!series.has(row.series_node)) series.set(row.series_node, series.size);
  ctx.save();
  try {
    ctx.font = "12px sans-serif";
    const presentation = chartPreviewTextLayout(item, (text) => ctx.measureText(text).width);
    if (presentation.state !== "ready") return false;
    const plot = presentation.plot;
    ctx.beginPath();
    ctx.rect(item.x, item.y - scrollTop, item.width, item.height);
    ctx.clip();
    if (empty) {
      ctx.fillStyle = "#666";
      ctx.textAlign = "center";
      ctx.fillText(
        "표시 계열에 숫자 데이터 없음",
        item.x + item.width / 2,
        item.y - scrollTop + item.height / 2,
      );
      if (presentation.title) {
        const title = presentation.title;
        for (const [index, line] of title.lines.entries())
          ctx.fillText(
            line,
            item.x + title.x,
            item.y - scrollTop + title.y + index * title.lineHeight,
          );
      }
    }
    if (presentation.ticks.length) paintChartPreviewGrid(ctx, presentation, item, scrollTop);
    for (const bar of bars) {
      const r = bar.rectangle;
      ctx.fillStyle = palette[series.get(bar.series_node) % palette.length];
      ctx.fillRect(
        item.x + plot.x + r.x * plot.width,
        item.y - scrollTop + plot.y + r.y * plot.height,
        r.width * plot.width,
        r.height * plot.height,
      );
    }
    if (stock && !paintChartStock(ctx, stock, plot, item.x + plot.x, item.y - scrollTop + plot.y))
      return false;
    if (
      bar3d &&
      !paintChartBar3D(
        ctx,
        bar3d,
        plot,
        item.x + plot.x,
        item.y - scrollTop + plot.y,
        (node) => palette[series.get(node) % palette.length],
      )
    )
      return false;
    if (lines.length)
      paintChartLines(
        ctx,
        lines,
        plot,
        item.x + plot.x,
        item.y - scrollTop + plot.y,
        (node) => palette[series.get(node) % palette.length],
      );
    if (
      scatter &&
      !paintChartScatter(
        ctx,
        scatter,
        plot,
        item.x + plot.x,
        item.y - scrollTop + plot.y,
        (node) => palette[series.get(node) % palette.length],
      )
    )
      return false;
    if (
      pie &&
      !paintChartPie(
        ctx,
        pie,
        plot,
        item.x + plot.x,
        item.y - scrollTop + plot.y,
        (index) => palette[index % palette.length],
      )
    )
      return false;
    if (
      pie3d &&
      !paintChartPie3D(
        ctx,
        pie3d,
        plot,
        item.x + plot.x,
        item.y - scrollTop + plot.y,
        (index) => palette[index % palette.length],
      )
    )
      return false;
    if (
      ofPie &&
      !paintChartOfPie(
        ctx,
        ofPie,
        plot,
        item.x + plot.x,
        item.y - scrollTop + plot.y,
        (index) => palette[index % palette.length],
      )
    )
      return false;
    if (presentation.direction)
      paintChartPreviewAnnotations(
        ctx,
        presentation,
        item,
        scrollTop,
        (node) => palette[(pie || pie3d || ofPie ? node : series.get(node)) % palette.length],
      );
    if (presentation.summary) report(presentation.summary);
    return true;
  } finally {
    ctx.restore();
  }
}
