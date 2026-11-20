import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  checkedChartCreatePayload,
  checkedChartCreateRequest,
} from '../../../js/hwpx-inline-object-insert.mjs';
const baseline = JSON.parse(
  await readFile(new URL('./fixtures/inline-object-chart-payload-wire.json', import.meta.url)),
);
const baselineCases = new Map(baseline.cases.map((value) => [JSON.stringify(value.input), value]));
function oldRequest(input) {
  const value = baselineCases.get(JSON.stringify(input));
  if (!value) throw Error('MissingPinnedValidatorBaseline');
  if (value.error) throw Error(value.error);
  return JSON.parse(value.expectedWire);
}
const types = JSON.parse(
  await readFile(
    new URL('../../../apps/demo/src/inline-object-insert-chart-type-options.json', import.meta.url),
  ),
);
const target = () => ({ section: 0, paragraph: 1, unit: 0, expected_text: '' });
const base = () => ({
  size: { width: 6000, height: 2000 },
  data: { categories: ['A', 'B'], series: [{ name: 'S', values: ['1.50', '-2e2'] }] },
});
function familyCase(type) {
  const payload = base();
  payload.chart = Object.fromEntries([
    ['kind', type.kind],
    ...type.fields.map((f) => [f.key, f.key === 'wireframe' ? f.default === 'true' : f.default]),
  ]);
  const kind = type.kind;
  if (['pieChart', 'pie3DChart', 'doughnutChart', 'ofPieChart'].includes(kind))
    payload.data.series[0].values = ['1.50', '2e2'];
  if (kind === 'scatterChart' || kind === 'bubbleChart') {
    payload.data.categories = [];
    payload.data.series[0].x_values = ['-1', '2'];
    if (kind === 'bubbleChart') payload.data.series[0].bubble_sizes = ['1', '2'];
  }
  if (kind === 'stockChart')
    payload.data.series = [
      ['high', ['5', '6']],
      ['low', ['1', '2']],
      ['close', ['3', '4']],
    ].map(([stock_role, values]) => ({ name: stock_role, stock_role, values }));
  if (kind === 'surfaceChart' || kind === 'surface3DChart')
    payload.data.series.push({ name: 'second', values: ['3', '4'] });
  return payload;
}
test('legacy payload has no target and full request remains byte exact with lexical strings', () => {
  const payload = base(),
    input = { target: target(), ...payload };
  assert.equal(JSON.stringify(checkedChartCreateRequest(input)), JSON.stringify(oldRequest(input)));
  assert.deepEqual(checkedChartCreatePayload(payload), payload);
  assert.equal(Object.hasOwn(checkedChartCreatePayload(payload), 'target'), false);
  assert.equal(checkedChartCreatePayload(payload).data.series[0].values[1], '-2e2');
});
for (const type of types.filter((x) => x.kind !== 'legacy'))
  test(`lexical payload ${type.kind} reuses full request semantics without physical target`, () => {
    const payload = familyCase(type),
      request = { target: target(), ...payload };
    const current = checkedChartCreateRequest(request),
      previous = oldRequest(request);
    assert.equal(JSON.stringify(current), JSON.stringify(previous));
    const { target: _ignored, ...expected } = current;
    assert.deepEqual(checkedChartCreatePayload(payload), expected);
    const isolated = checkedChartCreatePayload(payload);
    isolated.data.series[0].values[0] = 'changed';
    assert.notEqual(payload.data.series[0].values[0], 'changed');
  });
test('payload rejects any fake target or owner field', () => {
  for (const extra of [
    { target: target() },
    { owner: { kind: 'body' } },
    { physical_paragraph: 0 },
  ])
    assert.throws(() => checkedChartCreatePayload({ ...base(), ...extra }));
});
test('payload retains lexical negative-underflow pie and bubble rejection', () => {
  for (const kind of ['pieChart', 'bubbleChart']) {
    const p = familyCase(types.find((x) => x.kind === kind));
    if (kind === 'pieChart') p.data.series[0].values[0] = '-1e-5000';
    else p.data.series[0].bubble_sizes[0] = '-1e-5000';
    assert.throws(() => checkedChartCreatePayload(p), /InvalidChartNumber/);
    assert.throws(() => oldRequest({ target: target(), ...p }), /InvalidChartNumber/);
  }
});
test('stock lexical high/low differences are not rounded through f64', () => {
  const p = familyCase(types.find((x) => x.kind === 'stockChart'));
  p.data.series[0].values[0] = '1';
  p.data.series[1].values[0] = '1.0000000000000001';
  p.data.series[2].values[0] = '1';
  assert.throws(() => checkedChartCreatePayload(p), /InvalidChartStockValues/);
  assert.throws(() => oldRequest({ target: target(), ...p }), /InvalidChartStockValues/);
});
test('payload refuses holes, accessors and nonfinite/nonlexical data', () => {
  const cases = [];
  const hole = base();
  delete hole.data.series[0].values[0];
  cases.push(hole);
  const getter = base();
  Object.defineProperty(getter.data.series[0], 'name', {
    enumerable: true,
    get() {
      throw Error('GetterMustNotRun');
    },
  });
  cases.push(getter);
  for (const value of ['NaN', 'Infinity', 1.5, null]) {
    const p = base();
    p.data.series[0].values[0] = value;
    cases.push(p);
  }
  for (const p of cases) assert.throws(() => checkedChartCreatePayload(p));
});
