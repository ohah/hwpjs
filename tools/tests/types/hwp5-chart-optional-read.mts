import {
  createHwp5ChartDisplayApi,
  type Hwp5ChartReadExports,
  type Hwp5ChartCandidates,
  type Hwp5ChartDisplay,
} from '../../../js/hwp5-chart-display-api.mjs';
declare const exports: Hwp5ChartReadExports;
const result: number | undefined = exports.hwp5_edit_chart_display?.(2, 4);
// @ts-expect-error Native arguments are numeric, never a string owner.
exports.hwp5_edit_chart_display?.('2', 4);
// @ts-expect-error Native display requires both owner coordinates.
exports.hwp5_edit_chart_display?.(2);
declare const api: ReturnType<typeof createHwp5ChartDisplayApi>;
const candidates: Hwp5ChartCandidates = api.hwp5ChartCandidates();
const display: Hwp5ChartDisplay = api.hwp5ChartDisplay(2, 4);
const candidatesVersion: 1 = candidates.version;
const displayVersion: 1 = display.version;
void [result, candidatesVersion, displayVersion];
