import { chartBarLayout } from "./chart-bar-layout.mjs";
import { validChartView3D } from "../../js/chart-view-3d.mjs";
const unavailable = (reason) => ({ state: "unavailable", reason });

/** Right-angle normalized shear preview; no camera or source-state mutation. */
export function chartBar3DPrimitives(display, plotNode) {
  const index = display.plots.findIndex((plot) => plot.node === plotNode);
  if (index < 0) return unavailable("MissingChartPlot");
  if (display.plots[index].kind !== "bar3DChart") return unavailable("UnsupportedBar3DPlotKind");
  const view = display.view_3d,
    spatial = display.plot_settings[index].spatial;
  if (!view || !validChartView3D(view)) return unavailable("MissingChart3DView");
  if (view.unparsed_children) return unavailable("UnsupportedChart3DViewChildren");
  if (view.right_angle_axes?.value !== true) return unavailable("UnsupportedPerspectiveBar3D");
  if (
    [view.rotation_x, view.rotation_y, view.height_percent, view.depth_percent].some(
      (field) => field?.value == null,
    )
  )
    return unavailable("MissingChart3DViewValue");
  if (spatial?.shape?.value !== "box") return unavailable("UnsupportedChart3DBarShape");
  const gap = spatial.gap_depth?.value;
  if (!Number.isInteger(gap) || gap < 0 || gap > 500) return unavailable("MissingChart3DGapDepth");
  const layout = chartBarLayout(display, plotNode);
  if (layout.state !== "ready") return layout;
  // The reference plane is normalized, not a claim about source physical depth.
  const band = layout.bars.reduce(
    (maximum, bar) =>
      Math.max(maximum, layout.direction === "col" ? bar.rectangle.width : bar.rectangle.height),
    0,
  );
  const depth = (band * (view.depth_percent.value / 100)) / (1 + gap / 100);
  const height = view.height_percent.value / 100;
  const dx = depth * Math.sin((view.rotation_y.value * Math.PI) / 180);
  const dy = -depth * Math.sin((view.rotation_x.value * Math.PI) / 180);
  const project = (x, y, z) => ({
    x: (x + z * dx - Math.min(0, dx)) / (1 + Math.abs(dx)),
    y: (y * height + z * dy - Math.min(0, dy)) / (height + Math.abs(dy)),
  });
  const faces = [];
  for (const bar of layout.bars) {
    const r = bar.rectangle;
    if (r.width === 0 || r.height === 0) continue;
    const x0 = r.x,
      x1 = r.x + r.width,
      y0 = r.y,
      y1 = r.y + r.height;
    const add = (kind, vertices) =>
      faces.push({
        kind,
        series_node: bar.series_node,
        ordinal: bar.ordinal,
        index: bar.index,
        points: vertices.map(([x, y, z]) => project(x, y, z)),
        depth:
          vertices.reduce((sum, [x, y, z]) => sum + z - dx * x - dy * y * height, 0) /
          vertices.length,
      });
    add("front", [
      [x0, y0, 0],
      [x1, y0, 0],
      [x1, y1, 0],
      [x0, y1, 0],
    ]);
    if (dx !== 0) {
      const x = dx > 0 ? x1 : x0;
      add("side", [
        [x, y0, 0],
        [x, y1, 0],
        [x, y1, 1],
        [x, y0, 1],
      ]);
    }
    if (dy !== 0) {
      const y = dy < 0 ? y0 : y1;
      add("cap", [
        [x0, y, 0],
        [x0, y, 1],
        [x1, y, 1],
        [x1, y, 0],
      ]);
    }
  }
  if (!faces.length) return unavailable("EmptyChart3DGeometry");
  faces.sort((a, b) => b.depth - a.depth);
  const { bars: _geometryBars, ...metadata } = layout;
  return {
    ...metadata,
    axes_hidden: { value: true, category: true },
    warnings: [
      ...layout.warnings,
      "PreviewRightAngleShear",
      "PreviewNormalized3DDepth",
      "Preview3DFaceOrder",
      "Preview3DAxesOmitted",
    ],
    bar_3d: { faces, offset: { x: dx, y: dy }, depth, height },
  };
}
