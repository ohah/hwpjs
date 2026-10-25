import { chartPieLayout } from "./chart-pie-layout.mjs";
import { validChartView3D } from "../../js/chart-view-3d.mjs";
const unavailable = reason => ({ state: "unavailable", reason });
export function chartPie3DPrimitives(display, plotNode) {
  const plot = display.plots.find(plot => plot.node === plotNode);
  if (!plot) return unavailable("MissingChartPlot");
  if (plot.kind !== "pie3DChart") return unavailable("UnsupportedPie3DPlotKind");
  const view = display.view_3d;
  if (!view || !validChartView3D(view)) return unavailable("MissingChart3DView");
  if (view.unparsed_children) return unavailable("UnsupportedChart3DViewChildren");
  if ([view.rotation_x, view.rotation_y, view.height_percent, view.perspective].some(field => field?.value == null)) return unavailable("MissingChart3DViewValue");
  if (view.right_angle_axes?.value !== false || view.rotation_x.value <= 0 || view.perspective.value >= 180) return unavailable("UnsupportedPie3DCamera");
  const layout = chartPieLayout(display, plotNode);
  if (layout.state !== "ready") return layout;
  if (layout.pie.slices.some(slice => slice.explosion !== 0)) return unavailable("UnsupportedExplodedPie3D");
  // Explicit preview ellipse policy, not a general perspective camera solver.
  const ratio = Math.sin(view.rotation_x.value * Math.PI / 180) * Math.cos(view.perspective.value * Math.PI / 360);
  const wall_ratio = 0.2 * view.height_percent.value / 100;
  const rotation = view.rotation_y.value * Math.PI / 180;
  const walls = [];
  for (const [slice_position, slice] of layout.pie.slices.entries()) {
    const start = slice.start_angle + rotation, end = slice.end_angle + rotation;
    for (let turn = Math.floor(start / (2 * Math.PI)) - 1; turn <= Math.ceil(end / (2 * Math.PI)); turn++) {
      const first = Math.max(start, turn * 2 * Math.PI), last = Math.min(end, turn * 2 * Math.PI + Math.PI);
      if (last > first) walls.push({ slice_position, start_angle: first, end_angle: last });
    }
  }
  return { state: "ready", exact: false, warnings: [...layout.warnings, "PreviewPie3DEllipse", "PreviewPie3DThickness", "PreviewPie3DWallOrder"],
    pie_3d: { pie: layout.pie, ratio, wall_ratio, rotation, walls } };
}
