import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';
import { chartSeriesControlsHarness } from './chart-series-controls-harness.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('series form selection reaches Worker native save and independent two-copy history', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit series UI candidate required');
  const worker = await workerCanvasHarness(t);
  const h = chartSeriesControlsHarness();
  t.after(() => h.controls.close());
  const input = readFileSync('reference/rhwp/samples/issue6037/2차원원형-계열추가.hwpx');
  const loaded = await worker.send({
    kind: 'load',
    format: 'hwpx',
    bytes: input,
    allowObservedChartOleDeviations: true,
  });
  assert.equal(loaded.error, undefined);
  h.controls.message(loaded);
  await Promise.resolve();
  const enabled = await worker.send({ kind: 'enable' });
  assert.equal(enabled.error, undefined);
  assert.equal(enabled.content.chartSeriesTextEditAvailable, true);
  h.controls.message(enabled);
  await Promise.resolve();
  const flush = async () => {
    assert.equal(h.requests.length, 1);
    h.state.ready = false;
    const reply = await worker.send(h.requests.shift());
    h.state.ready = true;
    h.controls.message(reply);
    await Promise.resolve();
    return reply;
  };
  const originalPoints = (await flush()).chart;
  h.kinds.value = 'series';
  h.kinds.listeners.get('change')();
  const original = await flush();
  assert.equal(original.kind, 'chart-series-text');
  const wrapper = original.wrapper,
    row = original.chart.values[0];
  assert.equal(h.input.value, '계열 2');
  assert.equal(h.fields.disabled, false);
  const text = '폼 이름😀<&_x0008_\r\n';
  h.input.value = text;
  h.input.listeners.get('input')();
  h.form.listeners.get('submit')({ preventDefault() {} });
  assert.equal(h.requests[0].kind, 'chart-series-text-set');
  const edited = await flush();
  assert.equal(edited.error, undefined);
  const current = await flush();
  assert.equal(current.chart.values[0].text, text);
  assert.equal(h.input.value, text);
  const saved = Buffer.from((await worker.send({ kind: 'save' })).bytes);
  for (const flags of [[], ['-O']]) {
    const payload = {
      before: input.toString('base64'),
      after: saved.toString('base64'),
      chart: originalPoints.pair.chart_path,
      ole: originalPoints.pair.ole_path,
      value_node: row.value_node,
      kind: 'direct_series',
      value: text,
      allow_root_creation_zero: true,
    };
    const verify = (data) =>
      execFileSync('python3', [...flags, 'tools/hwpx-chart-session-oracle.py'], {
        input: JSON.stringify(data),
        timeout: 30000,
      });
    verify(payload);
    assert.throws(
      () => verify({ ...payload, value: 'wrong' }),
      (error) => error.status === 1 && /chart XML mismatch/.test(String(error.stderr)),
    );
  }
  const undone = await worker.send({ kind: 'undo' });
  h.controls.message(undone);
  await Promise.resolve();
  assert.equal((await flush()).chart.values[0].text, row.text);
  assert.deepEqual(Buffer.from((await worker.send({ kind: 'save' })).bytes), input);
  const refused = await worker.send({
    kind: 'chart-series-text-set',
    section: 0,
    wrapper,
    ordinal: 1,
    value: 'bad',
  });
  assert.equal(refused.error, 'InvalidChartSeriesTextIndex');
  assert.equal(refused.historyRevision, undone.historyRevision);
  const redone = await worker.send({ kind: 'redo' });
  h.controls.message(redone);
  await Promise.resolve();
  assert.equal((await flush()).chart.values[0].text, text);
  assert.deepEqual(Buffer.from((await worker.send({ kind: 'save' })).bytes), saved);
  const query = await worker.send({
    kind: 'chart-series-text',
    requestId: 99,
    section: 999,
    wrapper,
  });
  assert.equal(query.error, 'InvalidSectionIndex');
  assert.equal(query.requestId, 99);
  assert.equal(query.wrapper, wrapper);
});
