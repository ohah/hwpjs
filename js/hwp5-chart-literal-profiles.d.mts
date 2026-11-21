export type Hwp5ChartLiteralProfile =
  | 'spec24_clustered_column_literals_v1'
  | 'spec24_standard_line_literals_v1'
  | 'spec24_clustered_horizontal_bar_literals_v1';
export const HWP5_CHART_LITERAL_BAR_PROFILE: 'spec24_clustered_column_literals_v1';
export const HWP5_CHART_LITERAL_LINE_PROFILE: 'spec24_standard_line_literals_v1';
export const HWP5_CHART_LITERAL_HORIZONTAL_BAR_PROFILE: 'spec24_clustered_horizontal_bar_literals_v1';
export function hwp5ChartLiteralKind(profile: unknown): 'barChart' | 'lineChart';
export function supportsHwp5ChartLiteralProfile(version: number, profile: unknown): boolean;
