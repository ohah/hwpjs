import {
  object,
  uint,
  text,
  nullableUint,
  oneOf,
  field,
  scaling,
  number,
} from './chart-display-fields.mjs';
import { validateChartSeriesText } from './hwpx-chart-series-text.mjs';
import { validateChartRichText } from './hwpx-chart-rich-text.mjs';
import { chartDisplayHost } from './chart-display-host.mjs';
import { validChartSeriesSettings } from './chart-series-settings.mjs';
import { validChartPointSettings } from './chart-point-settings.mjs';
import { validChartStockSettings } from './chart-stock-settings.mjs';
import { validChartView3D } from './chart-view-3d.mjs';
import { validChartSpatialSettings } from './chart-spatial-settings.mjs';
const plotKinds = new Set([
  'areaChart',
  'area3DChart',
  'lineChart',
  'line3DChart',
  'stockChart',
  'radarChart',
  'scatterChart',
  'pieChart',
  'pie3DChart',
  'doughnutChart',
  'barChart',
  'bar3DChart',
  'ofPieChart',
  'surfaceChart',
  'surface3DChart',
  'bubbleChart',
]);
const pointKinds = new Set([
  'numeric_cache',
  'numeric_literal',
  'string_cache',
  'string_literal',
  'multilevel_cache',
]);
const roles = new Set(['name', 'category', 'value', 'x', 'y', 'bubble_size', 'unclassified']);
const fail = () => {
  throw new Error('InvalidChartDisplay');
};
const require = (condition) => {
  if (!condition) fail();
};

export function decodeChartDisplay(bytes) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  require(object(value) && value.kind === 'chart_display');
  for (const name of [
    'plots',
    'plot_settings',
    'axes',
    'axis_links',
    'points',
    'bindings',
    'series_text',
    'rich_text',
  ])
    require(Array.isArray(value[name]));
  const pair = value.pair;
  require(
    object(pair) &&
      text(pair.chart_path) &&
      pair.chart_path.length > 0 &&
      text(pair.ole_path) &&
      pair.ole_path.length > 0 &&
      uint(pair.wrapper_node) &&
      uint(pair.section_ordinal) &&
      typeof pair.declared_external === 'boolean' &&
      Array.isArray(pair.section_sha256) &&
      pair.section_sha256.length === 32 &&
      pair.section_sha256.every((n) => uint(n) && n <= 255),
  );
  require(chartDisplayHost(value.host, pair.wrapper_node));
  require(value.plots.length === value.plot_settings.length);
  const plots = new Map(),
    series = new Map(),
    references = new Map();
  // Chart XML identities only. Host/pair identities belong to the section tree.
  const hasStrokes =
    Array.isArray(value.series_settings) &&
    value.series_settings.some((row) => row?.stroke != null);
  const hasMajorTicks = value.axes.some((axis) => axis?.major_tick_mark != null);
  const occupied =
    value.view_3d == null && value.blank_policy == null && !hasStrokes && !hasMajorTicks
      ? null
      : new Set();
  let previousPlot = -1;
  for (const [index, plot] of value.plots.entries()) {
    require(
      object(plot) &&
        uint(plot.node) &&
        plot.node > previousPlot &&
        uint(plot.area_node) &&
        plot.area_node < plot.node &&
        plotKinds.has(plot.kind) &&
        Array.isArray(plot.series_nodes),
    );
    plots.set(plot.node, plot);
    previousPlot = plot.node;
    occupied?.add(plot.node);
    occupied?.add(plot.area_node);
    let previousSeries = plot.node;
    for (const node of plot.series_nodes) {
      require(uint(node) && node > previousSeries && !series.has(node));
      series.set(node, plot.node);
      previousSeries = node;
      occupied?.add(node);
    }
    const settings = value.plot_settings[index];
    require(
      object(settings) &&
        field(settings.direction, oneOf(['bar', 'col']), plot.node) &&
        field(
          settings.grouping,
          oneOf(['standard', 'clustered', 'stacked', 'percentStacked']),
          plot.node,
        ) &&
        field(settings.vary_colors, (v) => typeof v === 'boolean', plot.node) &&
        Array.isArray(settings.axis_references),
    );
    require(
      field(settings.gap_width, (v) => uint(v) && v <= 500, plot.node) &&
        field(settings.overlap, (v) => Number.isInteger(v) && v >= -100 && v <= 100, plot.node),
    );
    require(
      field(
        settings.scatter_style,
        oneOf(['line', 'lineMarker', 'marker', 'smooth', 'smoothMarker']),
        plot.node,
      ),
    );
    if (settings.scatter_style !== null) require(plot.kind === 'scatterChart');
    require(field(settings.first_slice_angle, (v) => uint(v) && v <= 360, plot.node));
    if (settings.first_slice_angle !== null)
      require(['pieChart', 'doughnutChart'].includes(plot.kind));
    require(
      field(settings.of_pie_type, oneOf(['pie', 'bar']), plot.node) &&
        field(settings.second_pie_size, (v) => uint(v) && v >= 5 && v <= 200, plot.node) &&
        field(settings.split_type, oneOf(['auto', 'cust', 'percent', 'pos', 'val']), plot.node) &&
        field(settings.split_position, number, plot.node) &&
        nullableUint(settings.custom_split_node) &&
        (settings.custom_split_node === null || settings.custom_split_node > plot.node),
    );
    if (
      [
        settings.of_pie_type,
        settings.second_pie_size,
        settings.split_type,
        settings.split_position,
        settings.custom_split_node,
      ].some((value) => value !== null)
    )
      require(plot.kind === 'ofPieChart');
    const bar = ['barChart', 'bar3DChart'].includes(plot.kind);
    if (settings.direction !== null) require(bar);
    if (settings.grouping !== null)
      require(bar || ['lineChart', 'line3DChart', 'areaChart', 'area3DChart'].includes(plot.kind));
    if (!bar && settings.grouping?.value === 'clustered') fail();
    if (settings.gap_width !== null)
      require(['barChart', 'bar3DChart', 'ofPieChart'].includes(plot.kind));
    if (settings.overlap !== null) require(plot.kind === 'barChart');
    const leaves = new Set();
    for (const leaf of [
      settings.direction,
      settings.grouping,
      settings.vary_colors,
      settings.gap_width,
      settings.overlap,
      settings.scatter_style,
      settings.first_slice_angle,
      settings.of_pie_type,
      settings.second_pie_size,
      settings.split_type,
      settings.split_position,
      ...(settings.custom_split_node === null ? [] : [{ node: settings.custom_split_node }]),
      ...settings.axis_references,
    ])
      if (leaf !== null) {
        require(object(leaf) && uint(leaf.node) && !leaves.has(leaf.node));
        leaves.add(leaf.node);
      }
    require(validChartStockSettings(settings.stock, plot.kind, plot.node, leaves));
    require(validChartSpatialSettings(settings.spatial, plot.kind, plot.node, leaves));
    for (const node of leaves) occupied?.add(node);
    for (const reference of settings.axis_references) {
      require(reference !== null && field(reference, uint, plot.node));
      const key = plot.node + ':' + reference.node;
      require(!references.has(key));
      references.set(key, reference.value);
    }
  }
  const axes = new Map(),
    definitions = new Map();
  require(validChartSeriesSettings(value.series_settings, plots, series, occupied));
  require(validChartPointSettings(value.point_settings, series, occupied));
  for (const axis of value.axes) {
    require(
      object(axis) &&
        uint(axis.node) &&
        !axes.has(axis.node) &&
        uint(axis.area_node) &&
        axis.area_node < axis.node &&
        ['catAx', 'valAx', 'dateAx', 'serAx'].includes(axis.kind) &&
        field(axis.id, uint, axis.node) &&
        field(axis.cross_axis, uint, axis.node) &&
        field(axis.position, oneOf(['b', 'l', 'r', 't']), axis.node) &&
        field(axis.deleted, (v) => typeof v === 'boolean', axis.node) &&
        scaling(axis.scaling, axis.node) &&
        (axis.major_tick_mark === undefined ||
          field(axis.major_tick_mark, oneOf(['cross', 'in', 'none', 'out']), axis.node)),
    );
    axes.set(axis.node, axis);
    occupied?.add(axis.node);
    occupied?.add(axis.area_node);
    for (const leaf of [
      axis.id,
      axis.cross_axis,
      axis.position,
      axis.deleted,
      axis.scaling,
      ...(axis.scaling
        ? [
            axis.scaling.orientation,
            axis.scaling.minimum,
            axis.scaling.maximum,
            axis.scaling.log_base,
          ]
        : []),
    ])
      if (leaf !== null) occupied?.add(leaf.node);
    if (axis.id?.value !== null && axis.id?.value !== undefined) {
      const key = axis.area_node + ':' + axis.id.value;
      const rows = definitions.get(key) ?? [];
      rows.push(axis.node);
      definitions.set(key, rows);
    }
  }
  require(value.axis_links.length === references.size);
  const seenLinks = new Set();
  for (const link of value.axis_links) {
    require(
      object(link) &&
        uint(link.plot_node) &&
        plots.has(link.plot_node) &&
        uint(link.reference_node) &&
        nullableUint(link.id) &&
        object(link.target),
    );
    const key = link.plot_node + ':' + link.reference_node;
    require(references.has(key) && !seenLinks.has(key) && references.get(key) === link.id);
    seenLinks.add(key);
    const matches =
      link.id === null
        ? []
        : (definitions.get(plots.get(link.plot_node).area_node + ':' + link.id) ?? []);
    const status =
      link.id === null
        ? 'missing_value'
        : matches.length === 0
          ? 'missing_definition'
          : matches.length > 1
            ? 'ambiguous'
            : 'resolved';
    require(
      link.target.status === status &&
        link.target.node === (status === 'resolved' ? matches[0] : null),
    );
  }
  require(value.bindings.length === value.points.length);
  let previousLeaf = -1;
  const pointNodes = new Set();
  for (const [index, point] of value.points.entries()) {
    require(
      object(point) &&
        [point.cache_node, point.point_node, point.value_node, point.index].every(uint) &&
        point.cache_node < point.point_node &&
        point.point_node < point.value_node &&
        point.value_node > previousLeaf &&
        !pointNodes.has(point.point_node) &&
        pointKinds.has(point.kind) &&
        text(point.value) &&
        nullableUint(point.level_node) &&
        (point.level_node === null ||
          (point.cache_node < point.level_node && point.level_node < point.point_node)) &&
        (point.kind === 'multilevel_cache') === (point.level_node !== null),
    );
    previousLeaf = point.value_node;
    pointNodes.add(point.point_node);
    for (const node of [point.cache_node, point.point_node, point.value_node, point.level_node])
      if (node !== null) occupied?.add(node);
    const binding = value.bindings[index];
    require(
      object(binding) &&
        binding.point === index &&
        [binding.series_node, binding.plot_node, binding.role_node].every(nullableUint) &&
        roles.has(binding.role),
    );
    for (const node of [binding.series_node, binding.plot_node, binding.role_node])
      if (node !== null) occupied?.add(node);
    if (binding.series_node === null)
      require(
        binding.plot_node === null && binding.role_node === null && binding.role === 'unclassified',
      );
    else {
      require(binding.plot_node !== null);
      if (series.has(binding.series_node))
        require(series.get(binding.series_node) === binding.plot_node);
      if (binding.role_node === null) require(binding.role === 'unclassified');
      else require(binding.role_node > binding.series_node && binding.role_node < point.cache_node);
    }
  }
  try {
    validateChartSeriesText({ kind: 'direct_series', values: value.series_text });
    validateChartRichText({ kind: 'rich_text', values: value.rich_text });
  } catch {
    fail();
  }
  for (const row of value.series_text)
    for (const node of [row.series_node, row.text_node, row.value_node]) occupied?.add(node);
  for (const row of value.rich_text)
    for (const node of [
      row.owner_node,
      row.text_node,
      row.rich_node,
      row.paragraph_node,
      row.run_node,
      row.value_node,
    ])
      occupied?.add(node);
  for (const row of value.series_settings)
    if (row.stroke != null) {
      for (const node of [row.stroke.node, row.stroke.no_fill_node].filter(
        (node) => node !== null,
      )) {
        require(!occupied.has(node));
        occupied.add(node);
      }
    }
  for (const axis of value.axes) {
    if (axis.major_tick_mark != null) {
      require(!occupied.has(axis.major_tick_mark.node));
      occupied.add(axis.major_tick_mark.node);
    }
  }
  if (value.blank_policy !== undefined && value.blank_policy !== null) {
    require(
      field(value.blank_policy, oneOf(['gap', 'zero', 'span']), 0) &&
        !occupied.has(value.blank_policy.node),
    );
    occupied.add(value.blank_policy.node);
  }
  require(validChartView3D(value.view_3d, occupied));
  return value;
}
