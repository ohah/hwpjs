import test from 'node:test';
import assert from 'node:assert/strict';
import { createHwpxChartApi } from '../../js/hwpx-chart-api.mjs';
function setup() {
  const calls = [];
  let active = true;
  const wasm = {
    hwpx_edit_chart_point_batch_max_edits: () => 4,
    hwpx_edit_chart_point_batch_max_bytes: () => 100,
    hwpx_edit_chart_point_max_bytes: () => 32,
    hwpx_edit_set_chart_points: (...args) => {
      calls.push(args);
      return true;
    },
  };
  const memory = {
    withBytes(bytes, callback) {
      calls.push([...bytes]);
      callback(88, bytes.length);
    },
    error: () => Error('NativeFailure'),
  };
  const api = createHwpxChartApi({
    wasm,
    memory,
    ready() {
      if (!active) throw Error('Disposed');
    },
    uint(n) {
      if (!Number.isInteger(n) || n < 0) throw Error('InvalidInteger');
    },
    encodedText: (text) => new TextEncoder().encode(text),
  });
  return {
    api,
    wasm,
    calls,
    dispose() {
      active = false;
    },
  };
}
test('chart batch facade shares native limits, bounded encoder and native mutation', () => {
  const f = setup();
  assert.deepEqual(f.api.chartPointBatchLimits(), {
    maxEdits: 4,
    maxBytes: 100,
    maxValueBytes: 32,
  });
  f.api.setChartPoints(2, 17, [{ point: 3, value: '가' }]);
  const wire = Uint8Array.from(f.calls[0]),
    v = new DataView(wire.buffer);
  assert.equal(v.getUint32(0, true), 1);
  assert.equal(v.getUint32(4, true), 3);
  assert.equal(v.getUint32(8, true), 3);
  assert.equal(new TextDecoder().decode(wire.subarray(12)), '가');
  assert.deepEqual(f.calls[1], [2, 17, 88, 15]);
});
test('invalid batches, absent ABI and disposed facade refuse before native writes', () => {
  const f = setup();
  assert.throws(
    () =>
      f.api.setChartPoints(0, 1, [
        { point: 1, value: 'a' },
        { point: 1, value: 'b' },
      ]),
    /DuplicateChartPointEdit/,
  );
  assert.throws(
    () => f.api.setChartPoints(0, 1, [{ point: 1, value: 'x'.repeat(33) }]),
    /LimitExceeded/,
  );
  assert.equal(f.calls.length, 0);
  delete f.wasm.hwpx_edit_chart_point_batch_max_bytes;
  assert.throws(() => f.api.chartPointBatchLimits(), /HwpxChartBatchEditAbiUnavailable/);
  assert.throws(() => f.api.setChartPoints(0, 1, []), /HwpxChartBatchEditAbiUnavailable/);
  assert.equal(f.calls.length, 0);
  f.dispose();
  assert.throws(() => f.api.chartPointBatchLimits(), /Disposed/);
  assert.throws(() => f.api.setChartPoints(0, 1, []), /Disposed/);
});
