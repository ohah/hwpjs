import type { RuntimeMessage } from '../../packages/core/src/contracts.ts';
import type { EditorState } from '../../packages/core/src/state/editor-state.ts';
import type {
  Hwp5ChartCreateOptions,
  Hwp5ChartCreateRequest,
} from '../../packages/core/src/commands/hwp5-chart-create-dto.ts';
import {
  inlineObjectInsertMessage,
  hwp5ChartCreatePreviewMessage,
  type CreateChartPayload,
  type InlineObjectInsertMessage,
  type Hwp5ChartCreatePreviewMessage,
} from '../../packages/core/src/commands/inline-object-insert.ts';
import {
  checkedHwp5ChartCreateOptions,
  HWP5_CHART_CREATE_PROFILE,
} from '../../js/hwp5-chart-create.mjs';
export function chartOptions(input: unknown): Hwp5ChartCreateOptions {
  return checkedHwp5ChartCreateOptions(input);
}
export function chartMessage(payload: CreateChartPayload, state: EditorState): RuntimeMessage {
  const value: InlineObjectInsertMessage = inlineObjectInsertMessage(payload, state, 'chart');
  return value;
}
export function previewMessage(payload: CreateChartPayload, state: EditorState): RuntimeMessage {
  const value: Hwp5ChartCreatePreviewMessage = hwp5ChartCreatePreviewMessage(payload, state);
  return value;
}
export function currentRequest(input: unknown, reference: unknown): Hwp5ChartCreateRequest {
  return { ...chartOptions(input), reference, start: 16 };
}
const options: Hwp5ChartCreateOptions = {
  profile: HWP5_CHART_CREATE_PROFILE,
  width: 20001,
  height: 12000,
  categories: ['One', 'Two'],
  series: [{ name: 'Own', values: [10, 20] }],
  preview: { width: 270, height: 162 },
};
// @ts-expect-error Unsupported profiles do not become portable DTO options.
const wrong: Hwp5ChartCreateOptions = { ...options, profile: 'unregistered-profile' };
void wrong;
