import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkedChartCreateOptions,
  checkedChartCreateRequest,
  checkedChartCreateProfile,
  chartCreateWireData,
  createHwpxInlineObjectInsertApi,
} from '../../js/hwpx-inline-object-insert.mjs';

import { profiles, optionsFor } from '../chart-kinds-fixtures.mjs';
const target = { section: 0, paragraph: 1, unit: 0, expected_text: '' };
function wire(options) {
  return {
    target,
    size: { width: options.width, height: options.height },
    data: chartCreateWireData(options),
    ...(options.chart ? { chart: options.chart } : {}),
  };
}
test('all sixteen exact profile kinds survive number DTO to lexical wire without aliasing', () => {
  assert.equal(new Set(profiles.map((p) => p.kind)).size, 16);
  for (const p of profiles) {
    const source = optionsFor(p),
      result = checkedChartCreateOptions(source);
    assert.deepEqual(result, source);
    assert.notEqual(result.series[0].values, source.series[0].values);
    const input = wire(result);
    assert.deepEqual(checkedChartCreateRequest(input), input);
    assert.notEqual(checkedChartCreateRequest(input).chart, input.chart);
  }
});
test('bar directions/groupings, line/area grouping, scatter/radar styles and OHLC are actual options', () => {
  for (const kind of ['barChart', 'bar3DChart'])
    for (const bar_direction of ['col', 'bar'])
      for (const grouping of ['standard', 'clustered', 'stacked', 'percentStacked'])
        assert.deepEqual(checkedChartCreateProfile({ kind, bar_direction, grouping }), {
          kind,
          bar_direction,
          grouping,
        });
  for (const kind of ['lineChart', 'line3DChart', 'areaChart', 'area3DChart'])
    for (const grouping of ['standard', 'stacked', 'percentStacked'])
      assert.deepEqual(checkedChartCreateProfile({ kind, grouping }), { kind, grouping });
  for (const scatter_style of ['none', 'line', 'lineMarker', 'marker', 'smooth', 'smoothMarker'])
    checkedChartCreateOptions(optionsFor({ kind: 'scatterChart', scatter_style }));
  for (const radar_style of ['standard', 'marker', 'filled'])
    checkedChartCreateOptions(optionsFor({ kind: 'radarChart', radar_style }));
  checkedChartCreateOptions(optionsFor({ kind: 'stockChart', stock_layout: 'openHighLowClose' }));
});
test('legacy options and exact three-field request JSON are preserved', () => {
  const options = { width: 1, height: 1, categories: ['A'], series: [{ name: 'S', values: [-0] }] };
  const checked = checkedChartCreateOptions(options);
  assert.deepEqual(checked, options);
  assert.equal(Object.hasOwn(checked, 'chart'), false);
  const json =
    '{"target":{"section":0,"paragraph":1,"unit":0,"expected_text":""},"size":{"width":1,"height":1},"data":{"categories":["A"],"series":[{"name":"S","values":["0"]}]}}';
  assert.equal(JSON.stringify(checkedChartCreateRequest(wire(checked))), json);
  const lexical = JSON.parse(json);
  lexical.data.series[0].values[0] = '-0';
  assert.equal(checkedChartCreateRequest(lexical).data.series[0].values[0], '-0');
});
test('strict profiles reject unknown kinds, wrong grouping, nulls, irrelevant keys and getters without invocation', () => {
  for (const chart of [
    null,
    undefined,
    {},
    { kind: 'column' },
    { kind: 'barChart' },
    { kind: 'lineChart', grouping: 'clustered' },
    { kind: 'pieChart', grouping: 'stacked' },
    { kind: 'surfaceChart', wireframe: 'false' },
    { kind: 'bubbleChart', scatter_style: 'marker' },
    { kind: 'stockChart', stock_layout: 'volumeHighLowClose' },
    { kind: 'radarChart', radar_style: null },
  ])
    assert.throws(() => checkedChartCreateOptions({ ...optionsFor({ kind: 'pieChart' }), chart }));
  let calls = 0;
  const chart = Object.defineProperty({}, 'kind', {
    enumerable: true,
    get() {
      ++calls;
      return 'bubbleChart';
    },
  });
  assert.throws(() => checkedChartCreateProfile(chart));
  assert.equal(calls, 0);
  const values = [1];
  Object.defineProperty(values, '0', {
    get() {
      ++calls;
      return 1;
    },
  });
  const options = optionsFor({ kind: 'bubbleChart' });
  options.series[0].x_values = values;
  assert.throws(() => checkedChartCreateOptions(options));
  assert.equal(calls, 0);
});
test('explicit X/size, stock roles, matrix shape and all finite number fields fail closed', () => {
  const bad = [];
  for (const field of ['values', 'x_values', 'bubble_sizes'])
    for (const value of [NaN, Infinity, -Infinity, '1', undefined]) {
      const o = optionsFor({ kind: 'bubbleChart' });
      o.series[0][field] = [value, 2];
      bad.push(o);
    }
  for (const field of ['x_values', 'bubble_sizes']) {
    const o = optionsFor({ kind: 'bubbleChart' });
    delete o.series[0][field];
    bad.push(o);
    const ragged = optionsFor({ kind: 'bubbleChart' });
    ragged.series[0][field] = [1];
    bad.push(ragged);
  }
  const negative = optionsFor({ kind: 'bubbleChart' });
  negative.series[0].bubble_sizes[0] = -1;
  bad.push(negative);
  const surface = optionsFor({ kind: 'surfaceChart', wireframe: false });
  surface.series.pop();
  bad.push(surface);
  const stock = optionsFor({ kind: 'stockChart', stock_layout: 'highLowClose' });
  stock.series.reverse();
  bad.push(stock);
  const prices = optionsFor({ kind: 'stockChart', stock_layout: 'highLowClose' });
  prices.series[1].values[0] = 100;
  bad.push(prices);
  const extra = optionsFor({ kind: 'pieChart' });
  extra.series[0].x_values = [1, 2];
  bad.push(extra);
  const pie = optionsFor({ kind: 'pieChart' });
  pie.series[0].values[0] = -1;
  bad.push(pie);
  const hole = optionsFor({ kind: 'bubbleChart' });
  delete hole.series[0].x_values[0];
  bad.push(hole);
  for (const options of bad) assert.throws(() => checkedChartCreateOptions(options));
  const input = wire(optionsFor({ kind: 'bubbleChart' }));
  input.data.series[0].x_values[0] = '-0.00e+2';
  assert.equal(checkedChartCreateRequest(input).data.series[0].x_values[0], '-0.00e+2');
  input.data.series[0].bubble_sizes[0] = '1e999';
  assert.throws(() => checkedChartCreateRequest(input));
});
test('absent/wrong/throwing capability never allocates or calls old Native for profiles', () => {
  for (const query of [
    undefined,
    () => 0,
    () => 2,
    () => 1n,
    () => true,
    () => {
      throw Error('query');
    },
  ]) {
    let calls = 0,
      allocs = 0;
    const wasm = {
      hwpx_edit_create_chart() {
        ++calls;
        return 1;
      },
      ...(query ? { hwpx_edit_chart_create_profile_version: query } : {}),
    };
    const memory = {
      withBytes(bytes, invoke) {
        ++allocs;
        return invoke(1, bytes.length);
      },
      error: () => Error('native'),
    };
    const api = createHwpxInlineObjectInsertApi({ wasm, memory, check() {} });
    assert.equal(api.supportsChartCreateProfileAbi(), false);
    assert.throws(
      () => api.createChart(wire(optionsFor({ kind: 'bubbleChart' }))),
      /ChartCreateProfileUnavailable/,
    );
    assert.equal(allocs, 0);
    assert.equal(calls, 0);
    const legacy = { width: 1, height: 1, categories: ['A'], series: [{ name: 'S', values: [1] }] };
    assert.equal(api.createChart(wire(legacy)).application, 'applied');
    assert.equal(calls, 1);
  }
});
test('v1 capability forwards exact validated request once; no retry and revoked capability rejects', () => {
  let version = 1,
    calls = 0,
    seen;
  const wasm = {
    hwpx_edit_chart_create_profile_version: () => version,
    hwpx_edit_create_chart() {
      ++calls;
      return 3;
    },
  };
  const memory = {
    withBytes(bytes, invoke) {
      seen = new TextDecoder().decode(bytes);
      return invoke(1, bytes.length);
    },
    error: () => Error('unknown'),
  };
  const api = createHwpxInlineObjectInsertApi({ wasm, memory, check() {} });
  const request = wire(optionsFor({ kind: 'bubbleChart' }));
  assert.equal(api.supportsChartCreateProfileAbi(), true);
  assert.equal(api.createChart(request).application, 'unknown');
  assert.equal(seen, JSON.stringify(request));
  assert.equal(calls, 1);
  version = 0;
  assert.throws(() => api.createChart(request), /Unavailable/);
  assert.equal(calls, 1);
});
