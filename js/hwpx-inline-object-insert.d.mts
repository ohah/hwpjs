import type {
  EquationInsertOptions,
  ChartCreateOptions,
  ChartCreateWireData,
  ChartCreateProfile,
  ChartCategoryProfile,
  ChartScatterProfile,
  ChartBubbleProfile,
  ChartStockProfile,
  ChartStockRole,
} from '../packages/core/src/commands/inline-object-insert.ts';
import type { NativeEditOutcome, NativeEditMemory } from './native-edit-outcome.mjs';

export function inlineInsertRecord<const K extends readonly string[]>(
  input: unknown,
  keys: K,
): { [P in K[number]]: unknown };
export function checkedEquationInsertOptions(input: unknown): EquationInsertOptions;
export function checkedChartCreateOptions(input: unknown): ChartCreateOptions;
export function checkedChartCreateProfile(input: unknown): ChartCreateProfile;
export interface ChartCreateWireSeries {
  readonly name: string;
  readonly values: readonly string[];
}
export interface ChartCreateXYWireSeries extends ChartCreateWireSeries {
  readonly x_values: readonly string[];
}
export interface ChartCreateBubbleWireSeries extends ChartCreateXYWireSeries {
  readonly bubble_sizes: readonly string[];
}
export interface ChartCreateStockWireSeries extends ChartCreateWireSeries {
  readonly stock_role: ChartStockRole;
}
export function chartCreateWireData(options: ChartCreateOptions): ChartCreateWireData;
export type EquationInsertRequest = EquationInsertOptions & {
  readonly section: number;
  readonly paragraph: number;
  readonly start: number;
  readonly expectedText: string;
};
type ChartWireData<S extends ChartCreateWireSeries = ChartCreateWireSeries> = {
  readonly categories: readonly string[];
  readonly series: readonly S[];
};
type ChartXYWireData<S extends ChartCreateXYWireSeries> = {
  readonly categories: readonly [];
  readonly series: readonly S[];
};
export type ChartCreateRequest = {
  readonly target: {
    readonly section: number;
    readonly paragraph: number;
    readonly unit: number;
    readonly expected_text: string;
  };
  readonly size: Pick<ChartCreateOptions, 'width' | 'height'>;
} & (
  | { readonly chart?: never; readonly data: ChartWireData }
  | { readonly chart: ChartCategoryProfile; readonly data: ChartWireData }
  | { readonly chart: ChartScatterProfile; readonly data: ChartXYWireData<ChartCreateXYWireSeries> }
  | {
      readonly chart: ChartBubbleProfile;
      readonly data: ChartXYWireData<ChartCreateBubbleWireSeries>;
    }
  | { readonly chart: ChartStockProfile; readonly data: ChartWireData<ChartCreateStockWireSeries> }
);
export function checkedEquationInsertRequest(input: unknown): EquationInsertRequest;
export function checkedChartCreateRequest(input: unknown): ChartCreateRequest;
export function createHwpxInlineObjectInsertApi(options: {
  readonly wasm: Readonly<Record<string, unknown>>;
  readonly memory: NativeEditMemory;
  check(): void;
}): {
  supportsEquationInsertionAbi(): boolean;
  supportsChartCreationAbi(): boolean;
  supportsChartCreateProfileAbi(): boolean;
  chartCreateProfileVersion(): 0 | 1;
  insertEquation(input: unknown): NativeEditOutcome;
  createChart(input: unknown): NativeEditOutcome;
};
