export const HWP5_CHART_CREATE_PROFILE = 'spec24-registered-png-presentation-v1';
export const HWP5_LINE_CHART_CREATE_PROFILE = 'spec24-registered-png-presentation-line-v1';

export function hwp5ChartCreateKind(profile) {
  switch (profile) {
    case HWP5_CHART_CREATE_PROFILE:
      return 'barChart';
    case HWP5_LINE_CHART_CREATE_PROFILE:
      return 'lineChart';
    default:
      throw Error('UnsupportedChartCreateProfile');
  }
}

export function supportsHwp5ChartCreateProfile(version, profile) {
  const kind = hwp5ChartCreateKind(profile);
  return version === 2 || (version === 1 && kind === 'barChart');
}
