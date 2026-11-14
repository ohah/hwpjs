import type {
  EquationInsertOptions,
  ChartCreateOptions,
} from '../packages/core/src/commands/inline-object-insert.ts';
import type { NativeEditOutcome, NativeEditMemory } from './native-edit-outcome.mjs';

export function inlineInsertRecord<const K extends readonly string[]>(
  input: unknown,
  keys: K,
): { [P in K[number]]: unknown };
export function checkedEquationInsertOptions(input: unknown): EquationInsertOptions;
export function checkedChartCreateOptions(input: unknown): ChartCreateOptions;
export type EquationInsertRequest = EquationInsertOptions & {
  readonly section: number;
  readonly paragraph: number;
  readonly start: number;
  readonly expectedText: string;
};
export interface ChartCreateRequest {
  readonly target: {
    readonly section: number;
    readonly paragraph: number;
    readonly unit: number;
    readonly expected_text: string;
  };
  readonly size: Pick<ChartCreateOptions, 'width' | 'height'>;
  readonly data: {
    readonly categories: readonly string[];
    readonly series: readonly { readonly name: string; readonly values: readonly string[] }[];
  };
}
export function checkedEquationInsertRequest(input: unknown): EquationInsertRequest;
export function checkedChartCreateRequest(input: unknown): ChartCreateRequest;
export function createHwpxInlineObjectInsertApi(options: {
  readonly wasm: Readonly<Record<string, unknown>>;
  readonly memory: NativeEditMemory;
  check(): void;
}): {
  supportsEquationInsertionAbi(): boolean;
  supportsChartCreationAbi(): boolean;
  insertEquation(input: unknown): NativeEditOutcome;
  createChart(input: unknown): NativeEditOutcome;
};
