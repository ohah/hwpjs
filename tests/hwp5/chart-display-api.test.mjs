import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHwp5ChartCandidates,
  decodeHwp5ChartDisplay,
  createHwp5ChartDisplayApi,
} from '../../js/hwp5-chart-display-api.mjs';
import { validateChartDisplayData } from '../../js/chart-display-data.mjs';
import { chartPreviewPrimitives } from '../../web/preview/chart-preview-primitives.mjs';
import { display, candidates, bytes } from './chart-display-wire-fixture.mjs';

test('H5 SDK wire keeps physical OLE ownership separate and shares generic data validation', () => {
  const authored = display();
  const value = decodeHwp5ChartDisplay(bytes(authored));
  assert.deepEqual(value, authored);
  assert.equal(Object.hasOwn(value, 'pair'), false);
  assert.equal(Object.hasOwn(value, 'host'), false);
  assert.deepEqual(validateChartDisplayData(value.data), value.data);
  assert.equal(chartPreviewPrimitives(value.data).state, 'ready');
  assert.deepEqual(decodeHwp5ChartCandidates(bytes(candidates())), candidates());
});
test('H5 SDK wire never promotes unresolved OLE or zero ordinal to a modern chart', () => {
  const value = candidates();
  const row = value.candidates[0];
  row.owner.ordinal = 0;
  row.resource = {
    state: 'unavailable',
    physical_id: null,
    resource_sha256: null,
    stream_entry: null,
    legacy_backup_present: null,
    presentation_streams: null,
    error_name: 'InvalidOleBinaryReference',
  };
  assert.equal(decodeHwp5ChartCandidates(bytes(value)).candidates[0].resource.state, 'unavailable');
  row.resource.state = 'modern_chart';
  assert.throws(() => decodeHwp5ChartCandidates(bytes(value)), /InvalidHwp5ChartReply/);
  const wire = display();
  wire.owner.ordinal = 0;
  assert.throws(() => decodeHwp5ChartDisplay(bytes(wire)), /InvalidHwp5ChartReply/);
});
test('H5 SDK wire rejects source/geometry mismatch, unknown epoch and fake HWPX pair', () => {
  for (const mutate of [
    (v) => {
      v.owner.geometry.control_node = 9;
    },
    (v) => {
      v.owner.geometry.kind_id = 0x24706963;
    },
    (v) => {
      delete v.owner.geometry.rotation_angle;
    },
    (v) => {
      v.source_epoch = '18446744073709551616';
    },
    (v) => {
      v.source_epoch = 9;
    },
    (v) => {
      v.pair = { wrapper_node: 4 };
    },
    (v) => {
      v.host = {};
    },
    (v) => {
      v.resource_sha256[0] = 256;
    },
    (v) => {
      v.owner.ole_node = 4;
    },
  ]) {
    const value = display();
    mutate(value);
    assert.throws(() => decodeHwp5ChartDisplay(bytes(value)));
  }
});
test('H5 SDK decoder retains generic point identity and coverage rejection without a format fallback', () => {
  const value = display();
  value.data.points[0].point_node = -1;
  assert.throws(() => decodeHwp5ChartDisplay(bytes(value)), /InvalidChartDisplay/);
  const duplicate = candidates();
  duplicate.candidates.push(structuredClone(duplicate.candidates[0]));
  assert.throws(() => decodeHwp5ChartCandidates(bytes(duplicate)), /InvalidHwp5ChartReply/);
});
function apiFixture() {
  let closed = false,
    outputValue = display(),
    version = 1;
  const calls = [];
  const wasm = {
    hwp5_edit_chart_display_profile_version: () => version,
    hwp5_edit_chart_candidates: () => {
      calls.push('candidates');
      return 1;
    },
    hwp5_edit_chart_display: (section, control) => {
      calls.push([section, control]);
      return 1;
    },
  };
  const api = createHwp5ChartDisplayApi({
    wasm,
    check() {
      if (closed) throw Error('EditorClosed');
    },
    output(action) {
      if (!action()) throw Error('NativeFailure');
      return { bytes: bytes(outputValue) };
    },
    u32(value) {
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw Error('InvalidU32');
      return value;
    },
  });
  return {
    api,
    wasm,
    calls,
    close() {
      closed = true;
    },
    version(value) {
      version = value;
    },
    output(value) {
      outputValue = value;
    },
  };
}
test('H5 SDK optional facade checks exact version/lifetime and original Native lookup arguments', () => {
  const f = apiFixture();
  assert.equal(f.api.supportsHwp5ChartDisplayAbi(), true);
  assert.deepEqual(f.api.hwp5ChartDisplay(2, 4), display());
  assert.deepEqual(f.calls, [[2, 4]]);
  f.output(candidates());
  assert.deepEqual(f.api.hwp5ChartCandidates(), candidates());
  f.version(2);
  assert.equal(f.api.supportsHwp5ChartDisplayAbi(), false);
  assert.throws(() => f.api.hwp5ChartDisplay(2, 4), /Unavailable/);
  assert.equal(f.calls.length, 2);
  f.close();
  assert.throws(() => f.api.hwp5ChartCandidates(), /EditorClosed/);
});
test('H5 SDK optional facade rejects old exports and mismatched Native owners without retry', () => {
  const old = apiFixture();
  delete old.wasm.hwp5_edit_chart_display;
  assert.equal(old.api.supportsHwp5ChartDisplayAbi(), false);
  assert.throws(() => old.api.hwp5ChartCandidates(), /Unavailable/);
  assert.equal(old.calls.length, 0);
  const changed = apiFixture();
  const value = display();
  value.section = 1;
  changed.output(value);
  assert.throws(() => changed.api.hwp5ChartDisplay(2, 4), /InvalidHwp5ChartReply/);
  assert.equal(changed.calls.length, 1);
});
