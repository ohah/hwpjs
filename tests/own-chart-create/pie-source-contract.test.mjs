import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedHwp5ChartCreateOptions } from '../../js/hwp5-chart-create.mjs';
import {
  HWP5_CHART_CREATE_PROFILE as bar,
  HWP5_LINE_CHART_CREATE_PROFILE as line,
  HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE as horizontal,
  HWP5_PIE_CHART_CREATE_PROFILE as pie,
  supportsHwp5ChartCreateProfile as supports,
  isHwp5ChartCreateProfileVersion,
} from '../../js/hwp5-chart-create-profiles.mjs';
import {
  checkedHwp5PieValues,
  checkedHwp5PiePreviewData,
} from '../../js/hwp5-chart-pie-create.mjs';
import { renderHwp5ChartCreatePreview } from '../../web/preview/hwp5-chart-create-preview.mjs';
import { model, context } from '../hwpx/chart-family-model.mjs';
const options = (values = [1, 2, 3]) => ({
  profile: pie,
  width: 12000,
  height: 12000,
  categories: ['One', 'Two', 'Three'],
  series: [{ name: 'Own', values }],
  preview: { width: 64, height: 64 },
});
function display() {
  const data = model('pieChart', [[1, 2, 3]]);
  delete data.host;
  delete data.pair;
  data.axes = [];
  data.axis_links = [];
  data.plot_settings[0].axis_references = [];
  data.plot_settings[0].vary_colors = { node: 4, value: true };
  data.plot_settings[0].first_slice_angle = { node: 5, value: 0 };
  return data;
}
function encoded(data) {
  return new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: 1,
      scope: 'hwp5-chart-create-preview',
      executionAuthority: false,
      xml_sha256: Array(32).fill(7),
      data,
    }),
  );
}
function host() {
  const recorded = context();
  let calls = 0;
  return {
    recorded,
    calls: () => calls,
    current: () => true,
    createCanvas(width, height) {
      calls++;
      return {
        width,
        height,
        getContext: () => recorded.ctx,
        async convertToBlob() {
          const bytes = new Uint8Array(33);
          bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
          bytes.set(new TextEncoder().encode('IHDR'), 12);
          const view = new DataView(bytes.buffer);
          view.setUint32(8, 13);
          view.setUint32(16, width);
          view.setUint32(20, height);
          return new Blob([bytes], { type: 'image/png' });
        },
      };
    },
  };
}
test('H5 capability4 adds pie while retaining each earlier profile and refusing unknown versions', () => {
  for (const v of [1, 2, 3, 4]) {
    assert(isHwp5ChartCreateProfileVersion(v));
    assert(supports(v, bar));
    assert.equal(supports(v, line), v >= 2);
    assert.equal(supports(v, horizontal), v >= 3);
    assert.equal(supports(v, pie), v === 4);
  }
  for (const v of [0, 5, '4', null, true, NaN])
    assert.equal(isHwp5ChartCreateProfileVersion(v), false);
});
test('H5 pie strict options use one nonnegative series and preserve signed zero', () => {
  const accepted = checkedHwp5ChartCreateOptions(options([-0, 2, 3]));
  assert.equal(accepted.profile, pie);
  assert.equal(accepted.series.length, 1);
  assert.throws(
    () =>
      checkedHwp5ChartCreateOptions({
        ...options(),
        series: [...options().series, options().series[0]],
      }),
    /Shape/,
  );
  assert.throws(() => checkedHwp5ChartCreateOptions(options([-1, 2, 3])), /Number/);
  assert.throws(() => checkedHwp5ChartCreateOptions(options([0, 0, 0])), /EmptyPieMagnitude/);
  assert.throws(() =>
    checkedHwp5ChartCreateOptions({ ...options(), chart: { kind: 'pie3DChart' } }),
  );
});
test('H5 raw decimal admission distinguishes signed zero from both nonzero underflow signs', () => {
  assert.deepEqual(checkedHwp5PieValues(['-0e-5000', '+0', '1']), [-0, 0, 1]);
  assert.throws(() => checkedHwp5PieValues(['-1e-5000', '1']), /InvalidChartNumericValue/);
  assert.throws(() => checkedHwp5PieValues(['1e-5000', '1']), /UnrepresentablePieShare/);
  assert.throws(() => checkedHwp5PieValues(['0', '-0e-5000']), /EmptyPieMagnitude/);
});
test('H5 pie reuses normalized fractions and rejects share or angle loss without sum overflow', () => {
  assert.deepEqual(checkedHwp5PieValues([Number.MAX_VALUE, Number.MAX_VALUE]), [
    Number.MAX_VALUE,
    Number.MAX_VALUE,
  ]);
  assert.deepEqual(checkedHwp5PieValues([Number.MIN_VALUE, Number.MIN_VALUE]), [
    Number.MIN_VALUE,
    Number.MIN_VALUE,
  ]);
  for (const values of [
    [1e308, 1e-308],
    [1, 1e-20],
  ])
    assert.throws(() => checkedHwp5PieValues(values), /UnrepresentablePieShare/);
});
test('H5 canonical pie preview uses existing model painter and creates a transient PNG payload', async () => {
  const data = display();
  assert.equal(checkedHwp5PiePreviewData(data), data);
  const painter = host();
  const result = await renderHwp5ChartCreatePreview(
    encoded(data),
    { width: 64, height: 64 },
    painter,
    pie,
  );
  assert.equal(painter.calls(), 1);
  assert.equal(result.mime, 'image/png');
  assert.deepEqual(result.source_xml_sha256, Array(32).fill(7));
  assert(painter.recorded.calls.some((row) => row[0] === 'arc'));
});
test('H5 pie preview refuses axes 3D marker smooth explosion angle and noncanonical settings before Canvas', async () => {
  const edits = [
    (d) => {
      d.axes = model().axes;
    },
    (d) => {
      d.axis_links = model().axis_links;
    },
    (d) => {
      d.plot_settings[0].axis_references = [{ node: 6, value: 1 }];
    },
    (d) => {
      d.view_3d = {};
    },
    (d) => {
      d.series_settings[0].marker = {};
    },
    (d) => {
      d.series_settings[0].smooth = { node: 20, value: true };
    },
    (d) => {
      d.series_settings[0].explosion = { node: 20, value: 1 };
    },
    (d) => {
      d.plot_settings[0].first_slice_angle.value = 1;
    },
    (d) => {
      d.plot_settings[0].vary_colors.value = false;
    },
    (d) => {
      d.plot_settings[0].grouping = { node: 6, value: 'standard' };
    },
  ];
  for (const edit of edits) {
    const data = display();
    edit(data);
    const painter = host();
    await assert.rejects(() =>
      renderHwp5ChartCreatePreview(encoded(data), { width: 64, height: 64 }, painter, pie),
    );
    assert.equal(painter.calls(), 0);
  }
});
test('H5 pie preview preserves lexical underflow refusal before Number-based display parsing', async () => {
  for (const value of ['-1e-5000', '1e-5000']) {
    const data = display();
    data.points[0].value = value;
    const painter = host();
    await assert.rejects(() =>
      renderHwp5ChartCreatePreview(encoded(data), { width: 64, height: 64 }, painter, pie),
    );
    assert.equal(painter.calls(), 0);
  }
});
