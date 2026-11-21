import { parseChartDecimal } from './chart-create-decimal.mjs';
import { chartCircularIntervals } from '../web/preview/chart-circular-intervals.mjs';

// Own preview normalization is shared; no alternate pie painter or hidden scaling.
export function checkedHwp5PieValues(values) {
  if (!Array.isArray(values) || values.length === 0) throw Error('EmptyPieMagnitude');
  const numbers = values.map((value) => {
    const text = String(value);
    const parsed = parseChartDecimal(text);
    const number = Number(text);
    if (parsed.negative || !Number.isFinite(number)) throw Error('InvalidChartNumericValue');
    if (parsed.digits.length !== 0 && number === 0) throw Error('UnrepresentablePieShare');
    return number;
  });
  const intervals = chartCircularIntervals(numbers, -Math.PI / 2);
  if (intervals.state !== 'ready') throw Error('UnrepresentablePieShare');
  if (intervals.empty) throw Error('EmptyPieMagnitude');
  return numbers;
}

// Strict own authored H5 profiles only; Native canonical proof remains edit authority.
export function checkedHwp5PiePreviewData(data) {
  const plot = data.plots[0],
    settings = data.plot_settings[0];
  if (!Array.isArray(data.point_settings) || !Array.isArray(data.series_settings))
    throw Error('UnsupportedChartCreatePreviewKind');
  if (
    data.plots.length !== 1 ||
    plot.kind !== 'pieChart' ||
    plot.series_nodes.length !== 1 ||
    data.axes.length !== 0 ||
    data.axis_links.length !== 0 ||
    settings.axis_references.length !== 0 ||
    data.view_3d !== null ||
    [
      'direction',
      'grouping',
      'spatial',
      'gap_width',
      'overlap',
      'scatter_style',
      'of_pie_type',
      'second_pie_size',
      'split_type',
      'split_position',
      'custom_split_node',
      'stock',
    ].some((key) => settings[key] !== null) ||
    settings.family_unparsed_children === true ||
    settings.vary_colors?.value !== true ||
    settings.first_slice_angle?.value !== 0 ||
    data.point_settings.length !== 0 ||
    data.rich_text.length !== 0 ||
    data.series_settings.length !== 1 ||
    data.series_settings.some((s) => s.explosion !== null || s.marker !== null || s.smooth !== null)
  )
    throw Error('UnsupportedChartCreatePreviewKind');
  const points = data.bindings
    .filter((b) => b.role === 'value' && b.series_node === plot.series_nodes[0])
    .map((binding) => data.points[binding.point].value);
  checkedHwp5PieValues(points);
  return data;
}
