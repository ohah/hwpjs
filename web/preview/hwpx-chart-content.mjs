// Derived display metadata only; values and positions remain native-owned.
export function attachHwpxCharts(editor, content, exports, allowObservedRepairs) {
  content.chartDisplayAvailable = exports.has('hwpx_edit_chart_display');
  content.chartEditAvailable = [
    'hwpx_edit_chart_nodes',
    'hwpx_edit_chart_points',
    'hwpx_edit_set_chart_numeric_point',
  ].every((name) => exports.has(name));
  content.chartStringEditAvailable = [
    'hwpx_edit_set_chart_point',
    'hwpx_edit_chart_point_max_bytes',
  ].every((name) => exports.has(name));
  content.chartPointBatchEditAvailable =
    content.chartEditAvailable &&
    content.chartStringEditAvailable &&
    [
      'hwpx_edit_set_chart_points',
      'hwpx_edit_chart_point_batch_max_edits',
      'hwpx_edit_chart_point_batch_max_bytes',
      'hwpx_edit_history_revision',
    ].every((name) => exports.has(name));
  content.chartPointBatchLimits = content.chartPointBatchEditAvailable
    ? editor.chartPointBatchLimits()
    : null;
  content.chartSeriesTextEditAvailable = [
    'hwpx_edit_chart_series_text',
    'hwpx_edit_set_chart_series_text',
    'hwpx_edit_chart_series_text_max_bytes',
  ].every((name) => exports.has(name));
  content.chartRichTextEditAvailable = [
    'hwpx_edit_chart_rich_text',
    'hwpx_edit_set_chart_rich_text',
    'hwpx_edit_chart_rich_text_max_bytes',
  ].every((name) => exports.has(name));
  content.chartOleObservedRepairsAllowed = allowObservedRepairs;
  content.chartTargets = [];
  if (!content.chartEditAvailable) return content;
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    if (exports.has('hwpx_edit_chart_sites')) {
      for (const site of editor.chartSites(section))
        content.chartTargets.push({
          ...site,
          section,
          paragraph: site.paragraph === null ? null : site.paragraph - 1,
        });
    } else
      for (const wrapper of editor.chartNodes(section))
        content.chartTargets.push({ section, wrapper });
  }
  return content;
}
