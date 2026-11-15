import { chartCartesianData } from './chart-cartesian-data.mjs';
import { chartFamilySettings } from './chart-family-settings.mjs';
import { chartFamily3DProjection } from './chart-family-3d.mjs';
import { createChartValueScale } from './chart-value-scale.mjs';
import {
  unavailable,
  familyWarnings,
  familyGeometry,
  familyBudget,
  addFamilyPolygon,
  addFamilyStroke,
} from './chart-family-geometry.mjs';
export function chartSurfacePrimitives(display, node) {
  const plot = display.plots.find((p) => p.node === node);
  if (!plot) return unavailable('MissingChartPlot');
  if (!['surfaceChart', 'surface3DChart'].includes(plot.kind))
    return unavailable('UnsupportedSurfacePlotKind');
  const settings = chartFamilySettings(display, node, { wireframe: (v) => typeof v === 'boolean' });
  if (settings.state !== 'ready') return settings;
  const data = chartCartesianData(display, node);
  if (data.state !== 'ready') return data;
  if (!familyBudget(data)) return unavailable('ChartFamilyCellBudgetExceeded');
  if (data.series.length < 2 || data.indices.length < 2)
    return unavailable('InsufficientSurfaceMatrix');
  if (data.series.some((s) => ['x', 'y', 'bubble_size'].some((r) => s.roles[r].length)))
    return unavailable('UnsupportedSurfaceRoles');
  const matrix = data.series.map((s) => {
    const points = new Map(s.points.map((p) => [p.index, p]));
    return data.indices.map((i) => points.get(i)?.value ?? null);
  });
  // Surface holes remain holes. No synthesized matrix or interpolation across absent cells.
  const scale = createChartValueScale(
    matrix
      .flat()
      .filter(Boolean)
      .map((v) => (v.number?.kind === 'finite' ? v.number.value : NaN)),
    data.valueAxis.scaling,
  );
  if (scale.state !== 'ready') return scale;
  let camera = null;
  if (plot.kind === 'surface3DChart') {
    // Surface has no gapDepth vocabulary. Reuse checked camera with a preview gap of zero.
    camera = chartFamily3DProjection(display, null, 0);
    if (camera.state !== 'ready') return camera;
  }
  const g = familyGeometry(plot.kind),
    cells = [];
  g.disclosure = settings.wireframe ? '표면 wireframe 근사' : '표면 셀 밴드 초안';
  for (let r = matrix.length - 2; r >= 0; r--)
    for (let c = 0; c < matrix[r].length - 1; c++) {
      const addresses = [
        [r, c],
        [r, c + 1],
        [r + 1, c + 1],
        [r + 1, c],
      ];
      if (addresses.some(([i, j]) => matrix[i][j] === null)) continue;
      const samples = addresses.map(([i, j]) => ({
        row: i,
        column: j,
        ordinal: matrix[i][j].ordinal,
        value: matrix[i][j].number.value,
      }));
      const points = samples.map((s) => {
        const value = scale.project(s.value),
          x0 = s.column / (data.indices.length - 1),
          x = data.categoryReversed ? 1 - x0 : x0,
          z = s.row / (data.series.length - 1);
        if (!Number.isFinite(value)) return { x: NaN, y: NaN };
        return camera ? camera.project({ x, y: 1 - value }, z) : { x, y: 1 - z };
      });
      if (points.some((p) => ![p.x, p.y].every(Number.isFinite)))
        return unavailable('InvalidChartCoordinate');
      const series_node = data.series[r].node;
      let magnitude = 0;
      for (const s of samples) magnitude += Math.max(0, Math.min(1, scale.project(s.value))) / 4;
      const color_index = Math.min(5, Math.floor(magnitude * 6));
      if (settings.wireframe)
        for (let k = 0; k < 4; k++) addFamilyStroke(g, points[k], points[(k + 1) % 4], series_node);
      else if (!addFamilyPolygon(g, points, series_node, { color_index }))
        return unavailable('InvalidChartCoordinate');
      cells.push({ row: r, column: c, samples, color_index });
    }
  return {
    state: 'ready',
    exact: false,
    family_geometry: g,
    surface_cells: cells,
    wireframe: settings.wireframe,
    warnings: [
      ...familyWarnings,
      'PreviewSurfaceCellBands',
      'PreviewSurfaceHolesOmitted',
      ...(settings.wireframe ? ['PreviewSurfaceWireframeApproximation'] : []),
      ...(camera
        ? ['PreviewRightAngleShear', 'PreviewNormalized3DDepth', 'Preview3DSeriesPlanes']
        : []),
      'SourceSurfaceAxesAndLabelsNotApplied',
    ],
  };
}
