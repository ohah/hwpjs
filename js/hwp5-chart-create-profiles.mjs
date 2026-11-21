export const HWP5_CHART_CREATE_PROFILE = 'spec24-registered-png-presentation-v1';
export const HWP5_LINE_CHART_CREATE_PROFILE = 'spec24-registered-png-presentation-line-v1';
export const HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE =
  'spec24-registered-png-presentation-horizontal-bar-v1';

export function isHwp5ChartCreateProfileVersion(version) {
  return version === 1 || version === 2 || version === 3;
}

export function hwp5ChartCreateKind(profile) {
  switch (profile) {
    case HWP5_CHART_CREATE_PROFILE:
    case HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE:
      return 'barChart';
    case HWP5_LINE_CHART_CREATE_PROFILE:
      return 'lineChart';
    default:
      throw Error('UnsupportedChartCreateProfile');
  }
}

export function supportsHwp5ChartCreateProfile(version, profile) {
  hwp5ChartCreateKind(profile);
  if (!isHwp5ChartCreateProfileVersion(version)) return false;
  if (profile === HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE) return version === 3;
  if (profile === HWP5_LINE_CHART_CREATE_PROFILE) return version !== 1;
  return true;
}
