export const HWP5_CHART_CREATE_PROFILE: 'spec24-registered-png-presentation-v1';
export const HWP5_LINE_CHART_CREATE_PROFILE: 'spec24-registered-png-presentation-line-v1';
export const HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE: 'spec24-registered-png-presentation-horizontal-bar-v1';
export function isHwp5ChartCreateProfileVersion(version: unknown): version is 1 | 2 | 3;
export function hwp5ChartCreateKind(profile: unknown): 'barChart' | 'lineChart';
export function supportsHwp5ChartCreateProfile(
  version: unknown,
  profile:
    | typeof HWP5_CHART_CREATE_PROFILE
    | typeof HWP5_LINE_CHART_CREATE_PROFILE
    | typeof HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE,
): boolean;
