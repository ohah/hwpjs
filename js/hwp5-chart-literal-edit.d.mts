import type {
  Hwp5ChartLiterals,
  Hwp5ChartLiteralEdit,
} from '../packages/core/src/commands/hwp5-chart-data.ts';
import type { NativeEditOutcome } from './native-edit-outcome.mjs';
export interface Hwp5ChartLiteralSourceCapture {
  readonly section: number;
  readonly controlNode: number;
  readonly literals: Hwp5ChartLiterals;
  readonly historyRevision: number;
  readonly profile: import('./hwp5-chart-literal-profiles.mjs').Hwp5ChartLiteralProfile;
}
export function checkedHwp5LiteralEdits(input: unknown): Hwp5ChartLiteralEdit[];
export function createHwp5ChartLiteralEditApi(options: unknown): {
  supportsHwp5ChartLiteralEditAbi(): boolean;
  captureHwp5ChartData(section: number, controlNode: number): Hwp5ChartLiteralSourceCapture;
  isHwp5ChartDataCurrent(capture: Hwp5ChartLiteralSourceCapture): boolean;
  editHwp5ChartData(
    capture: Hwp5ChartLiteralSourceCapture,
    edits: readonly Hwp5ChartLiteralEdit[],
  ): Promise<NativeEditOutcome>;
};
