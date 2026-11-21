/** Lease profile names differ from creation profiles; never infer from editable UI data. */
export const HWP5_CHART_LITERAL_BAR_PROFILE = 'spec24_clustered_column_literals_v1';
export const HWP5_CHART_LITERAL_LINE_PROFILE = 'spec24_standard_line_literals_v1';
export function hwp5ChartLiteralKind(profile) {
  switch (profile) {
    case HWP5_CHART_LITERAL_BAR_PROFILE: return 'barChart';
    case HWP5_CHART_LITERAL_LINE_PROFILE: return 'lineChart';
    default: throw Error('UnsupportedChartLiteralEditProfile');
  }
}
export function supportsHwp5ChartLiteralProfile(version, profile) {
  const kind = hwp5ChartLiteralKind(profile);
  return version === 2 || (version === 1 && kind === 'barChart');
}
