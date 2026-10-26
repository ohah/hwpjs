import { chartCircularData } from './chart-circular-data.mjs';
import { chartFirstCircularSeries } from './chart-circular-series.mjs';
import { chartBlankPolicy } from './chart-blank-policy.mjs';

// Explicit no-data preview, never substitute later series or invent zeroes.
export function emptyCircularPreview(display, plotNode, rejected) {
  if (!['MissingPieValue', 'MissingOfPieValue'].includes(rejected?.reason)) return rejected;
  const data = chartCircularData(display, plotNode);
  if (data.state !== 'ready') return rejected;
  const selected = chartFirstCircularSeries(data),
    policy = chartBlankPolicy(display);
  if (selected.state !== 'selected' || policy.state !== 'selected' || policy.value !== 'gap')
    return rejected;
  const row = selected.row;
  if (
    !row.points.length ||
    row.points.some((point) => point.value !== null || point.value_ordinal !== null)
  )
    return rejected;
  return {
    state: 'ready',
    exact: false,
    empty_circular: {
      series_node: row.series_node,
      category_count: row.points.length,
      non_displayed_series_nodes: selected.non_displayed_series_nodes,
    },
    warnings: [
      ...selected.warnings,
      ...policy.warnings,
      'PreviewEmptyCircularSeries',
      'SourceStylesNotApplied',
    ],
  };
}

export function validEmptyCircularPreview(value) {
  return (
    value &&
    Number.isSafeInteger(value.series_node) &&
    value.series_node >= 0 &&
    Number.isSafeInteger(value.category_count) &&
    value.category_count > 0 &&
    Array.isArray(value.non_displayed_series_nodes) &&
    value.non_displayed_series_nodes.every(
      (node) => Number.isSafeInteger(node) && node >= 0 && node !== value.series_node,
    ) &&
    new Set(value.non_displayed_series_nodes).size === value.non_displayed_series_nodes.length
  );
}
