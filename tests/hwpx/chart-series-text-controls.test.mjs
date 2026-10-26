import test from 'node:test';
import assert from 'node:assert/strict';
import { chartSeriesControlsHarness as setup } from './chart-series-controls-harness.mjs';
const content = {
  chartEditAvailable: true,
  chartStringEditAvailable: true,
  chartSeriesTextEditAvailable: true,
  chartTargets: [{ section: 0, wrapper: 9 }],
};
const names = {
  kind: 'direct_series',
  values: [{ series_node: 1, text_node: 2, value_node: 3, text: '이름\r\n원문' }],
};

test('chart series controls preserve native spelling and keep stale point responses out of names', async () => {
  const h = setup();
  try {
    h.controls.message({ kind: 'enable', content });
    await Promise.resolve();
    const pointQuery = h.requests.shift();
    h.kinds.value = 'series';
    h.kinds.listeners.get('change')();
    const query = h.requests.shift();
    assert.equal(query.kind, 'chart-series-text');
    h.controls.message({
      ...pointQuery,
      chart: { values: { points: [{ kind: 'numeric_cache', value: '99' }] } },
    });
    assert.equal(h.fields.disabled, true);
    h.controls.message({ ...query, chart: names });
    assert.equal(h.fields.disabled, false);
    assert.equal(h.input.value, names.values[0].text);
    const submit = () => h.form.listeners.get('submit')({ preventDefault() {} });
    submit();
    assert.deepEqual(h.requests.shift(), {
      kind: 'chart-series-text-set',
      section: 0,
      wrapper: 9,
      ordinal: 0,
      value: names.values[0].text,
    });
    h.input.value = '초안😀';
    h.input.listeners.get('input')();
    let cancelled = false;
    h.input.listeners.get('keydown')({
      key: 'Escape',
      preventDefault() {
        cancelled = true;
      },
      stopPropagation() {},
    });
    assert.equal(cancelled, true);
    assert.equal(h.input.value, names.values[0].text);
    assert.equal(h.requests.length, 0);
    h.input.value = '새 이름😀';
    h.input.listeners.get('input')();
    submit();
    assert.equal(h.requests.shift().value, '새 이름😀');
    assert.equal(names.values[0].text, '이름\r\n원문');
    for (const value of ['', '-1', '0.5', 'NaN', '1']) {
      h.points.value = value;
      h.points.listeners.get('change')();
      submit();
      assert.equal(h.fields.disabled, true);
      assert.equal(h.requests.length, 0);
    }
  } finally {
    h.controls.close();
  }
  assert.equal(h.kinds.listeners.size, 0);
});

test('chart series capability removal load and busy mode switches invalidate previous queries', async () => {
  const h = setup();
  try {
    h.controls.message({ kind: 'enable', content });
    await Promise.resolve();
    h.requests.shift();
    h.kinds.value = 'series';
    h.kinds.listeners.get('change')();
    const old = h.requests.shift();
    h.state.ready = false;
    h.kinds.value = 'points';
    h.kinds.listeners.get('change')();
    h.kinds.value = 'series';
    h.kinds.listeners.get('change')();
    h.state.ready = true;
    h.controls.message({ ...old, chart: names });
    assert.equal(h.fields.disabled, true);
    h.controls.message({ kind: 'undo', content });
    await Promise.resolve();
    h.controls.message({ ...h.requests.shift(), chart: names });
    assert.equal(h.fields.disabled, false);
    h.controls.message({
      kind: 'undo',
      content: { ...content, chartSeriesTextEditAvailable: false },
    });
    await Promise.resolve();
    assert.equal(h.kinds.value, 'points');
    assert.equal(h.kinds.disabled, true);
    h.controls.message({ kind: 'load' });
    assert.equal(h.form.hidden, true);
    assert.equal(h.input.value, '');
    h.controls.message({ ...old, chart: names });
    assert.equal(h.form.hidden, true);
  } finally {
    h.controls.close();
  }
});
