import type {
  Hwp5ChartCreateOptions,
  Hwp5ChartCreateProfile,
} from '../packages/core/src/commands/hwp5-chart-create-dto.ts';
export type { Hwp5ChartCreateOptions } from '../packages/core/src/commands/hwp5-chart-create-dto.ts';
export const HWP5_CHART_CREATE_PROFILE: Hwp5ChartCreateProfile;
export function checkedHwp5ChartCreateOptions(input: unknown): Hwp5ChartCreateOptions;
export function createHwp5ChartCreateApi(options: any): {
  supportsChartCreationAbi(): boolean;
  chartCreateProfileVersion(): number;
  chartCreatePreview(input: unknown): Uint8Array;
  createChart(
    input: unknown,
    renderer: { createCanvas: (width: number, height: number) => any; current?: () => boolean },
  ): Promise<
    import('./native-edit-outcome.mjs').NativeEditOutcome & {
      readonly chartPreviewWarnings?: readonly string[];
      readonly chartPreviewRendering?: string;
    }
  >;
};
