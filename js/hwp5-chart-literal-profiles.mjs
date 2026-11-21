/** Lease profile names differ from creation profiles; never infer from editable UI data. */
export const HWP5_CHART_LITERAL_BAR_PROFILE = 'spec24_clustered_column_literals_v1';
export const HWP5_CHART_LITERAL_LINE_PROFILE = 'spec24_standard_line_literals_v1';
export const HWP5_CHART_LITERAL_HORIZONTAL_BAR_PROFILE =
  'spec24_clustered_horizontal_bar_literals_v1';
export const HWP5_CHART_LITERAL_PIE_PROFILE = 'spec24_standard_pie_literals_v1';
export function hwp5ChartLiteralKind(profile) {
  switch (profile) {
    case HWP5_CHART_LITERAL_BAR_PROFILE:
    case HWP5_CHART_LITERAL_HORIZONTAL_BAR_PROFILE:
      return 'barChart';
    case HWP5_CHART_LITERAL_PIE_PROFILE:
      return 'pieChart';
    case HWP5_CHART_LITERAL_LINE_PROFILE:
      return 'lineChart';
    default:
      throw Error('UnsupportedChartLiteralEditProfile');
  }
}
export function supportsHwp5ChartLiteralProfile(version, profile) {
  const kind = hwp5ChartLiteralKind(profile);
  if (![1, 2, 3, 4].includes(version)) return false;
  if (profile === HWP5_CHART_LITERAL_PIE_PROFILE) return version === 4;
  if (profile === HWP5_CHART_LITERAL_HORIZONTAL_BAR_PROFILE) return version >= 3;
  return version !== 1 || kind === 'barChart';
}
