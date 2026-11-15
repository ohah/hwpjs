import test from 'node:test';
import assert from 'node:assert/strict';
import vectors from '../fixtures/chart-create-decimal-vectors.json' with { type: 'json' };
import { parseChartDecimal, compareChartDecimals } from '../../js/chart-create-decimal.mjs';
import {
  checkedChartCreateRequest,
  checkedChartCreateOptions,
} from '../../js/hwpx-inline-object-insert.mjs';
const target = { section: 0, paragraph: 1, unit: 0, expected_text: '' },
  size = { width: 1, height: 1 };
function scalar(kind, value) {
  return {
    target,
    size,
    chart: { kind, ...(kind === 'ofPieChart' ? { of_pie_type: 'pie' } : {}) },
    data:
      kind === 'bubbleChart'
        ? {
            categories: [],
            series: [{ name: 'S', values: ['1'], x_values: ['1'], bubble_sizes: [value] }],
          }
        : { categories: ['A'], series: [{ name: 'S', values: [value] }] },
  };
}
function stock(high, low, close, open) {
  return {
    target,
    size,
    chart: {
      kind: 'stockChart',
      stock_layout: open === undefined ? 'highLowClose' : 'openHighLowClose',
    },
    data: {
      categories: ['D'],
      series: [
        ...(open === undefined ? [] : [{ name: 'O', stock_role: 'open', values: [open] }]),
        { name: 'H', stock_role: 'high', values: [high] },
        { name: 'L', stock_role: 'low', values: [low] },
        { name: 'C', stock_role: 'close', values: [close] },
      ],
    },
  };
}
test('exact decimal SSOT matches 83 independent Decimal oracle vectors, without float ordering', () => {
  for (const v of vectors)
    assert.equal(
      compareChartDecimals(v.left, v.right),
      { lt: -1, eq: 0, gt: 1 }[v.order],
      JSON.stringify(v),
    );
  for (const bad of [
    '',
    '-',
    '.',
    '1..2',
    '1e',
    '1e+',
    '1e+-2',
    '1e10001',
    '0e-10001',
    '1e99999999999999999999',
    '1 2',
    'NaN',
  ])
    assert.throws(() => parseChartDecimal(bad));
  assert.equal(parseChartDecimal('-0e-10000').negative, false);
  assert.equal(parseChartDecimal('-1e-5000').negative, true);
});
test('pie and bubble reject negative nonzero underflow while true signed zero and tiny positives retain lexemes', () => {
  for (const kind of ['pieChart', 'pie3DChart', 'doughnutChart', 'ofPieChart', 'bubbleChart']) {
    for (const value of ['-1e-5000', '-0.00000000000000000000000001e-5000', '-5e-324'])
      assert.throws(() => checkedChartCreateRequest(scalar(kind, value)), /InvalidChartNumber/);
    for (const value of ['-0', '-0e-5000', '0', '1e-5000', '5e-324']) {
      const result = checkedChartCreateRequest(scalar(kind, value));
      assert.equal(
        result.data.series[0][kind === 'bubbleChart' ? 'bubble_sizes' : 'values'][0],
        value,
      );
    }
  }
});
test('HLC and OHLC admission compares exact decimal authored relations after finite validation', () => {
  for (const request of [
    stock('1', '1.0000000000000001', '1'),
    stock('1', '0', '1.0000000000000001'),
    stock('1', '0', '1', '1.0000000000000001'),
    stock('1e-5000', '2e-5000', '1e-5000'),
  ])
    assert.throws(() => checkedChartCreateRequest(request), /InvalidChartStockValues/);
  for (const request of [
    stock('1.0000000000000002', '1.0000000000000000', '1.0000000000000001', '1.0000000000000001'),
    stock('3e-5000', '1e-5000', '2e-5000'),
    stock('-1', '-1.0000000000000002', '-1.0000000000000001'),
    stock('0', '-0', '-0e-5000'),
  ])
    assert.deepEqual(checkedChartCreateRequest(request), request);
});
test('explicit profiles bound decimal exponents without changing absent-chart legacy admission', () => {
  const explicit = scalar('pieChart', '0e-10001');
  assert.throws(() => checkedChartCreateRequest(explicit), /InvalidChartNumber/);
  delete explicit.chart;
  assert.equal(checkedChartCreateRequest(explicit).data.series[0].values[0], '0e-10001');
  const options = {
    width: 1,
    height: 1,
    chart: { kind: 'bubbleChart' },
    categories: [],
    series: [{ name: 'S', values: [1], x_values: [1], bubble_sizes: [-Number.MIN_VALUE] }],
  };
  assert.throws(() => checkedChartCreateOptions(options), /InvalidChartNumber/);
});
test('serialized-cache boundary counts, differing XY lengths and legacy value-point budget', () => {
  const values = Array(4096).fill(1),
    categories = Array(4096).fill('A');
  const rows = Array.from({ length: 4 }, (_, i) => ({ name: String(i), values }));
  const chart = { kind: 'barChart', bar_direction: 'col', grouping: 'clustered' };
  checkedChartCreateOptions({ width: 1, height: 1, chart, categories, series: rows.slice(0, 2) });
  const over = Array.from({ length: 3 }, (_, i) => ({
    name: String(i),
    values: values.slice(0, 2731),
  }));
  assert.throws(
    () =>
      checkedChartCreateOptions({
        width: 1,
        height: 1,
        chart,
        categories: categories.slice(0, 2731),
        series: over,
      }),
    /ChartPointLimitExceeded/,
  );
  checkedChartCreateOptions({ width: 1, height: 1, categories, series: rows });
  assert.throws(
    () => checkedChartCreateOptions({ width: 1, height: 1, chart, categories, series: rows }),
    /ChartPointLimitExceeded/,
  );
  const series = [2730, 2731].map((n, i) => ({
    name: String(i),
    values: values.slice(0, n),
    x_values: values.slice(0, n),
    bubble_sizes: values.slice(0, n),
  }));
  checkedChartCreateOptions({
    width: 1,
    height: 1,
    chart: { kind: 'bubbleChart' },
    categories: [],
    series,
  });
  assert.throws(
    () =>
      checkedChartCreateOptions({
        width: 1,
        height: 1,
        chart: { kind: 'bubbleChart' },
        categories: [],
        series: [series[1], series[1]],
      }),
    /ChartPointLimitExceeded/,
  );
});
