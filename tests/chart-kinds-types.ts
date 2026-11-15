import type {
  ChartCreateOptions,
  ChartCreateProfile,
} from '../packages/core/src/commands/inline-object-insert.ts';
const size = { width: 1, height: 1 };
const legacy: ChartCreateOptions = {
  ...size,
  categories: ['A'],
  series: [{ name: 'S', values: [1] }],
};
const bubble: ChartCreateOptions = {
  ...size,
  chart: { kind: 'bubbleChart' },
  categories: [],
  series: [{ name: 'S', values: [1], x_values: [2], bubble_sizes: [3] }],
};
// @ts-expect-error explicit bar direction required
const absent: ChartCreateProfile = { kind: 'barChart', grouping: 'clustered' };
// @ts-expect-error clustered is not a line grouping
const line: ChartCreateProfile = { kind: 'lineChart', grouping: 'clustered' };
// @ts-expect-error explicit X and bubble sizes required
const bad: ChartCreateOptions = {
  ...size,
  chart: { kind: 'bubbleChart' },
  categories: [],
  series: [{ name: 'S', values: [1] }],
};
// @ts-expect-error no nullable chart opt-in
const nullable: ChartCreateOptions = { ...legacy, chart: null };
void [legacy, bubble, absent, line, bad, nullable];

import type { ChartCreateRequest } from '../js/hwpx-inline-object-insert.mjs';
const target = { section: 0, paragraph: 1, unit: 0, expected_text: '' };
// @ts-expect-error explicit wire bubble profile requires X and size fields
const badWire: ChartCreateRequest = {
  target,
  size,
  chart: { kind: 'bubbleChart' },
  data: { categories: [], series: [{ name: 'S', values: ['1'] }] },
};
// @ts-expect-error stock profile requires explicit typed roles
const badStock: ChartCreateOptions = {
  ...size,
  chart: { kind: 'stockChart', stock_layout: 'highLowClose' },
  categories: ['D'],
  series: [{ name: 'S', values: [1] }],
};
void [badWire, badStock];

import type {
  ChartCreateWireData,
  ChartStockRole,
} from '../packages/core/src/commands/inline-object-insert.ts';
type Assert<T extends true> = T;
type XYWire = Extract<
  ChartCreateWireData,
  { readonly series: readonly { readonly x_values: readonly string[] }[] }
>;
type BubbleWire = Extract<
  ChartCreateWireData,
  { readonly series: readonly { readonly bubble_sizes: readonly string[] }[] }
>;
type StockWire = Extract<
  ChartCreateWireData,
  { readonly series: readonly { readonly stock_role: ChartStockRole }[] }
>;
type XYRetained = Assert<[XYWire] extends [never] ? false : true>;
type BubbleRetained = Assert<[BubbleWire] extends [never] ? false : true>;
type StockRetained = Assert<[StockWire] extends [never] ? false : true>;
type NativeAcceptsDerived = Assert<
  ChartCreateWireData extends ChartCreateRequest['data'] ? true : false
>;
type DerivedAcceptsNative = Assert<
  ChartCreateRequest['data'] extends ChartCreateWireData ? true : false
>;
const badWireDecimal: ChartCreateWireData = {
  categories: ['A'],
  // @ts-expect-error Native wire decimal values stay strings.
  series: [{ name: 's', values: [1] }],
};
const badDerivedBubble: BubbleWire = {
  categories: [],
  // @ts-expect-error Derived bubble wire retains mandatory bubble sizes.
  series: [{ name: 'b', values: ['1'], x_values: ['2'] }],
};
void [badWireDecimal, badDerivedBubble];

export type ChartWireRetentionAssertions = [
  XYRetained,
  BubbleRetained,
  StockRetained,
  NativeAcceptsDerived,
  DerivedAcceptsNative,
];
