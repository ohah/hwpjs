import type { Hwp5ChartCreateProfile } from '../packages/core/src/commands/hwp5-chart-create-dto.ts';

export const HWP5_CHART_CREATE_PROFILE: 'spec24-registered-png-presentation-v1';
export const HWP5_LINE_CHART_CREATE_PROFILE: 'spec24-registered-png-presentation-line-v1';
export function hwp5ChartCreateKind(profile: unknown): 'barChart' | 'lineChart';
export function supportsHwp5ChartCreateProfile(
  version: unknown,
  profile: Hwp5ChartCreateProfile,
): boolean;
