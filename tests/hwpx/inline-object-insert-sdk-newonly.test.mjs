import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHwpxInlineObjectInsertApi,
  checkedChartCreateOptions,
  checkedEquationInsertOptions,
} from '../../js/hwpx-inline-object-insert.mjs';
const eq = {
  section: 0,
  paragraph: 1,
  start: 2,
  expectedText: '한😀글',
  script: 'a+b',
  width: 6000,
  height: 2000,
  baseLine: 85,
  baseUnit: 1000,
  version: 'Equation Version 60',
  font: 'HYhwpEQ',
};
const chart = {
  target: { section: 0, paragraph: 1, unit: 2, expected_text: 'abc' },
  size: { width: 20000, height: 12000 },
  data: { categories: ['A', 'B'], series: [{ name: 'S', values: ['1.5', '-2e2'] }] },
};
function harness(code = 1) {
  const calls = [];
  let allocated = 0,
    freed = 0;
  const wasm = Object.fromEntries(
    ['hwpx_edit_insert_equation', 'hwpx_edit_create_chart'].map((name) => [
      name,
      (ptr, size) => {
        calls.push([name, JSON.parse(new TextDecoder().decode(ptr)), size]);
        if (code instanceof Error) throw code;
        return code;
      },
    ]),
  );
  const memory = {
    withBytes(bytes, fn) {
      allocated++;
      try {
        return fn(bytes, bytes.length);
      } finally {
        freed++;
      }
    },
    error: () => Error('NativeRejected'),
  };
  return {
    api: createHwpxInlineObjectInsertApi({ wasm, memory, check() {} }),
    calls,
    counts: () => [allocated, freed],
  };
}
test('new ABIs absent: fail closed without allocation or mutation', () => {
  const api = createHwpxInlineObjectInsertApi({
    wasm: {},
    memory: {
      withBytes() {
        assert.fail();
      },
    },
    check() {},
  });
  assert.equal(api.supportsEquationInsertionAbi(), false);
  assert.equal(api.supportsChartCreationAbi(), false);
  assert.throws(() => api.insertEquation(eq), /Unavailable/);
  assert.throws(() => api.createChart(chart), /Unavailable/);
});
test('equation DTO reaches one Native call with source witness and explicit geometry', () => {
  const h = harness();
  const result = h.api.insertEquation(eq);
  assert.equal(result.application, 'applied');
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0][1], eq);
  assert.deepEqual(h.counts(), [1, 1]);
});
test('chart DTO preserves series order, counts and finite decimal values', () => {
  const h = harness();
  h.api.createChart(chart);
  assert.deepEqual(h.calls[0][1], chart);
  assert.deepEqual(h.counts(), [1, 1]);
});
test('Native reject/no-op/unknown/invalid results are classified; no retry', () => {
  for (const [code, application] of [
    [0, 'unapplied'],
    [2, 'unapplied'],
    [3, 'unknown'],
    [17, 'unknown'],
    [Error('transport'), 'unknown'],
  ]) {
    const h = harness(code),
      result = h.api.insertEquation(eq);
    assert.equal(result.application, application);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.counts(), [1, 1]);
  }
});
test('cleanup failure after successful call retains applied outcome', () => {
  const api = createHwpxInlineObjectInsertApi({
    wasm: { hwpx_edit_insert_equation: () => 1 },
    check() {},
    memory: {
      withBytes(bytes, fn) {
        fn(1, bytes.length);
        throw Error('free failed');
      },
      error: () => Error('native'),
    },
  });
  const result = api.insertEquation(eq);
  assert.equal(result.application, 'applied');
  assert.equal(result.cleanupError, 'free failed');
});
test('invalid DTOs cannot allocate, including getters, extra keys and malformed scalars', () => {
  const h = harness();
  for (const change of [
    { width: 0 },
    { section: 1 },
    { paragraph: 0 },
    { baseUnit: Infinity },
    { font: '\ud800' },
    { script: '\u0000' },
    { extra: true },
  ])
    assert.throws(() => h.api.insertEquation({ ...eq, ...change }));
  let invoked = false;
  assert.throws(() =>
    h.api.insertEquation({
      ...eq,
      get script() {
        invoked = true;
        return 'x';
      },
    }),
  );
  assert.equal(invoked, false);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.counts(), [0, 0]);
});
test('bounded chart options own arrays and reject missing, unequal, nonfinite, sparse input', () => {
  const input = { width: 1, height: 1, categories: ['A'], series: [{ name: 'S', values: [3] }] };
  const owned = checkedChartCreateOptions(input);
  input.series[0].values[0] = 9;
  assert.equal(owned.series[0].values[0], 3);
  const sparse = [];
  sparse.length = 1;
  for (const values of [[NaN], [Infinity], ['1'], [], sparse, [1, 2]])
    assert.throws(() => checkedChartCreateOptions({ ...input, series: [{ name: 'S', values }] }));
  assert.throws(() => checkedChartCreateOptions({ ...input, categories: [] }));
  assert.throws(() => checkedChartCreateOptions({ ...input, categories: Array(4097).fill('x') }));
  assert.throws(() => checkedEquationInsertOptions({ ...eq }));
});
test('request byte envelope matches Native 8MiB ceiling before allocation', () => {
  const h = harness();
  assert.throws(
    () => h.api.insertEquation({ ...eq, expectedText: 'a'.repeat(8 * 1024 * 1024), script: 'x' }),
    /InlineObjectRequestLimitExceeded/,
  );
  assert.deepEqual(h.counts(), [0, 0]);
  assert.equal(h.calls.length, 0);
});
