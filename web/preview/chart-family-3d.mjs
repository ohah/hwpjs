import { validChartView3D } from '../../js/chart-view-3d.mjs';
import {
  unavailable,
  familyGeometry,
  addFamilyPolygon,
  addFamilyStroke,
} from './chart-family-geometry.mjs';
export function chartFamily3DProjection(display, settings, previewGap = null) {
  const v = display.view_3d;
  if (!v || !validChartView3D(v)) return unavailable('MissingChart3DView');
  if (v.unparsed_children) return unavailable('UnsupportedChart3DViewChildren');
  if (v.right_angle_axes?.value !== true) return unavailable('UnsupportedPerspectiveChartFamily');
  if ([v.rotation_x, v.rotation_y, v.height_percent, v.depth_percent].some((f) => f?.value == null))
    return unavailable('MissingChart3DViewValue');
  const gap = previewGap ?? settings?.spatial?.gap_depth?.value;
  if (!Number.isInteger(gap) || gap < 0 || gap > 500) return unavailable('MissingChart3DGapDepth');
  const depth = v.depth_percent.value / 100 / (1 + gap / 100),
    height = v.height_percent.value / 100;
  const dx = depth * Math.sin((v.rotation_y.value * Math.PI) / 180),
    dy = -depth * Math.sin((v.rotation_x.value * Math.PI) / 180);
  return {
    state: 'ready',
    project: (p, z) => ({
      x: (p.x + z * dx - Math.min(0, dx)) / (1 + Math.abs(dx)),
      y: (p.y * height + z * dy - Math.min(0, dy)) / (height + Math.abs(dy)),
    }),
  };
}
export function projectFamily3D(display, plotNode, layout, line = false) {
  if (layout.state !== 'ready') return layout;
  const index = display.plots.findIndex((p) => p.node === plotNode),
    kind = display.plots[index].kind;
  const camera = chartFamily3DProjection(display, display.plot_settings[index]);
  if (camera.state !== 'ready') return camera;
  const g = familyGeometry(kind),
    nodes = display.plots[index].series_nodes;
  const ordinals = new Map();
  for (let ordinal = 0; ordinal < nodes.length; ordinal++) {
    if (!(ordinal in nodes)) continue;
    const node = nodes[ordinal];
    // indexOf uses strict equality: retain its first occurrence, including +/-0,
    // and never treat NaN or a sparse hole as a matching source node.
    if (!Number.isNaN(node) && !ordinals.has(node)) ordinals.set(node, ordinal);
  }
  const ordinalFor = (node) => ordinals.get(node) ?? -1;
  const zFor = (node) => (nodes.length <= 1 ? 0.5 : 1 - ordinalFor(node) / (nodes.length - 1));
  const planeOrder = (items) => {
    if (nodes.length <= 1) return items;
    const buckets = Array.from({ length: nodes.length + 1 }, () => []);
    for (const item of items) buckets[ordinalFor(item.series_node) + 1].push(item);
    const ordered = [];
    // Unknown ordinal -1 is the old greatest z; then first source ordinal ascends.
    for (const bucket of buckets) for (const item of bucket) ordered.push(item);
    return ordered;
  };
  if (line)
    for (const row of layout.lines) {
      const z = zFor(row.series_node);
      for (const path of row.paths)
        for (let i = 1; i < path.length; i++) {
          if (
            !addFamilyStroke(
              g,
              camera.project(path[i - 1], z),
              camera.project(path[i], z),
              row.series_node,
            )
          )
            return unavailable('InvalidChartCoordinate');
        }
    }
  else
    for (const polygon of layout.family_geometry.polygons) {
      const z = zFor(polygon.series_node);
      if (
        !addFamilyPolygon(
          g,
          polygon.points.map((p) => camera.project(p, z)),
          polygon.series_node,
        )
      )
        return unavailable('InvalidChartCoordinate');
    }
  // Back to front series planes. No source camera/perspective fidelity claim.
  g.polygons = planeOrder(g.polygons);
  g.strokes = planeOrder(g.strokes);
  const {
    lines: _lines,
    area_rows: _areaRows,
    family_geometry: _familyGeometry,
    ...metadata
  } = layout;
  return {
    ...metadata,
    axes_hidden: { value: true, category: true },
    family_geometry: g,
    warnings: [
      ...layout.warnings,
      'PreviewRightAngleShear',
      'PreviewNormalized3DDepth',
      'Preview3DAxesOmitted',
      'Preview3DSeriesPlanes',
      ...(line ? ['SourceMarkersNotApplied'] : []),
    ],
  };
}
