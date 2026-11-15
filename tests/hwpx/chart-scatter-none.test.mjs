import test from 'node:test';
import assert from 'node:assert/strict';
import { model, context } from './chart-family-model.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chartPreviewPrimitives } from '../../web/preview/chart-preview-primitives.mjs';
import { paintChartPreview } from '../../web/preview/chart-preview-paint.mjs';
import { chartScatterData } from '../../web/preview/chart-scatter-data.mjs';
import { chartScatterPrimitives } from '../../web/preview/chart-scatter-primitives.mjs';
import { paintChartScatter } from '../../web/preview/chart-scatter-paint.mjs';
import { decodeChartDisplay } from '../../js/hwpx-chart-display.mjs';

function source(style = 'none') {
  const dto = model('bubbleChart', [[2, 3, 4]]);
  dto.plots[0].kind = 'scatterChart';
  dto.plot_settings[0].scatter_style = { node: 4, value: style };
  const keep = dto.bindings.filter((binding) => binding.role !== 'bubble_size');
  dto.points = keep.map((binding) => dto.points[binding.point]);
  dto.bindings = keep.map((binding, index) => ({ ...binding, point: index }));
  return dto;
}
function paint(value) {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args) =>
          calls.push([key, ...args]),
      set: () => true,
    },
  );
  assert.equal(
    paintChartScatter(ctx, value, { width: 100, height: 80 }, 0, 0, () => '#123456'),
    true,
  );
  return calls;
}
test('strict decoded none retains actual XY indices axes legend and source without default geometry', () => {
  const dto = source(),
    before = structuredClone(dto);
  const decoded = decodeChartDisplay(new TextEncoder().encode(JSON.stringify(dto)));
  assert.equal(chartScatterData(decoded, 3).style, 'none');
  const p = chartScatterPrimitives(decoded, 3);
  assert.equal(p.state, 'ready');
  assert.deepEqual(
    p.scatter.rows[0].points.map((v) => [v.x_value, v.y_value]),
    [
      [10, 2],
      [20, 3],
      [30, 4],
    ],
  );
  assert.equal(p.scatter.rows[0].curves, null);
  assert.equal(p.scatter.rows[0].smooth, false);
  assert.equal(p.scatter.rows[0].marker.symbol, 'none');
  assert.equal(p.scatter.rows[0].marker.radius, 0);
  const calls = paint(p.scatter);
  for (const op of ['lineTo', 'bezierCurveTo', 'arc', 'stroke'])
    assert.equal(calls.filter((c) => c[0] === op).length, 0, op);
  assert.equal(
    calls.filter((c) => c[0] === 'save').length,
    calls.filter((c) => c[0] === 'restore').length,
  );
  assert.deepEqual(dto, before);
});
test('none suppresses implicit curves but retains explicit supported series marker override', () => {
  const dto = source();
  dto.series_settings[0].smooth = { node: 500, value: true };
  dto.series_settings[0].marker = {
    node: 501,
    symbol: { node: 502, value: 'square' },
    size: { node: 503, value: 6 },
  };
  const p = chartScatterPrimitives(dto, 3);
  assert.equal(p.state, 'ready');
  assert.equal(p.scatter.rows[0].curves, null);
  assert.equal(p.scatter.rows[0].marker.symbol, 'square');
  const calls = paint(p.scatter);
  assert.equal(calls.filter((c) => c[0] === 'lineTo').length, 0);
  assert.equal(calls.filter((c) => c[0] === 'fill').length, 3);
});
test('legacy primitive direct painter fallback for none is empty; malformed/missing style stays unavailable', () => {
  const points = [
    { x: 0, y: 0, break_before: true },
    { x: 1, y: 1, break_before: false },
  ];
  const calls = paint({ style: 'none', rows: [{ series_node: 1, points }] });
  assert.equal(
    calls.some((c) => ['lineTo', 'arc', 'stroke'].includes(c[0])),
    false,
  );
  const dto = source();
  dto.plot_settings[0].scatter_style = null;
  assert.equal(chartScatterPrimitives(dto, 3).reason, 'MissingScatterStyle');
});
test('the five existing scatter styles keep their line/marker and curve source policies', () => {
  for (const style of ['line', 'lineMarker', 'marker', 'smooth', 'smoothMarker']) {
    const p = chartScatterPrimitives(source(style), 3);
    assert.equal(p.state, 'ready', style);
    assert.equal(
      p.scatter.rows[0].marker.symbol,
      ['lineMarker', 'marker', 'smoothMarker'].includes(style) ? 'circle' : 'none',
    );
    const calls = paint(p.scatter);
    assert.equal(
      calls.some((c) => c[0] === 'arc'),
      ['lineMarker', 'marker', 'smoothMarker'].includes(style),
    );
    assert.equal(
      calls.some((c) => c[0] === 'lineTo'),
      ['line', 'lineMarker'].includes(style),
    );
    assert.equal(
      calls.some((c) => c[0] === 'bezierCurveTo'),
      ['smooth', 'smoothMarker'].includes(style),
    );
  }
});

// Actual read-only normal source SDK chartDisplay capture, not an authored DTO.
// Input synthetic scatter SHA f45775968ba5425c648f640c2670b54775d703612f9d82e854dcfee8e0fc3e91.
// Exact normal Small a3a363615683bffcace0212df625c8351f8546bab9aa23a824c91863db95a6e3.
// Source: chartNodes-derived section/wrapper -> chartDisplay -> finally close.
// Readable fixture bytes are pretty JSON, not the original compact capture.
// Replay original Native UTF-8 serialization and verify its recorded SHA below.
const actualNativeNoneFixture = JSON.parse(
  readFileSync(new URL('./fixtures/chart-scatter-none-native.json', import.meta.url), 'utf8'),
);
const actualNativeNoneBytes = Buffer.from(JSON.stringify(actualNativeNoneFixture) + '\n', 'utf8');
const actualNativeNoneSha256 = '002d8eb6c026bb4dbe7f06731f5a42fcb6fd19bf8a951acd210f7e403af1556a';
function actualNone() {
  assert.equal(
    createHash('sha256').update(actualNativeNoneBytes).digest('hex'),
    actualNativeNoneSha256,
  );
  return decodeChartDisplay(actualNativeNoneBytes);
}
function fullPaint(primitives, width = 600, height = 400) {
  const c = context();
  const painted = paintChartPreview(c.ctx, { x: 20, y: 50, width, height, primitives }, 30);
  assert.equal(c.depth(), 0, 'full painter must balance canvas state');
  return { ...c, painted };
}
test('actual captured Native none crosses complete dispatch and full preview paint boundary', () => {
  const dto = actualNone(),
    before = structuredClone(dto);
  const p = chartPreviewPrimitives(dto);
  assert.equal(p.state, 'ready', JSON.stringify(p));
  assert.equal(p.scatter.style, 'none');
  assert.equal(p.scatter.rows[0].curves, null);
  assert.equal(p.scatter.rows[0].marker.symbol, 'none');
  for (const [width, height] of [
    [600, 400],
    [dto.host.geometry.width / 75, dto.host.geometry.height / 75],
  ]) {
    const c = fullPaint(p, width, height);
    assert.equal(c.painted, true, 'full preview entry admits valid none rather than placeholder');
    assert(
      c.calls.some(([name]) => name === 'fillText'),
      'axes or legend remain paintable',
    );
    assert.equal(
      c.calls.some(([name]) => ['arc', 'bezierCurveTo'].includes(name)),
      false,
    );
    // The final nested plot clip belongs to the scatter series painter. Grid
    // strokes and legend text stay outside this region and remain legitimate.
    const clip = c.calls.map(([name]) => name).lastIndexOf('clip');
    assert(clip > 0);
    const afterClip = c.calls.slice(clip + 1);
    const restore = afterClip.findIndex(([name]) => name === 'restore');
    assert(restore >= 0);
    assert.equal(
      afterClip
        .slice(0, restore)
        .some(([name]) => ['lineTo', 'bezierCurveTo', 'arc', 'stroke', 'fill'].includes(name)),
      false,
      'full entry draws no none-series line or marker',
    );
  }
  const seriesCalls = paint(p.scatter);
  assert.equal(
    seriesCalls.some(([name]) => ['lineTo', 'bezierCurveTo', 'arc', 'stroke'].includes(name)),
    false,
    'none must not draw data lines or markers',
  );
  assert.deepEqual(dto, before);
});
test('record-derived supported styles all traverse full entry; original capture remains unchanged', () => {
  for (const style of ['none', 'line', 'lineMarker', 'marker', 'smooth', 'smoothMarker']) {
    // Intentional style-only variant of the actual recorded DTO, not claimed Native output.
    const dto = actualNone();
    dto.plot_settings[0].scatter_style.value = style;
    const p = chartPreviewPrimitives(dto);
    assert.equal(p.state, 'ready', style);
    assert.equal(fullPaint(p).painted, true, style);
  }
  assert.equal(actualNone().plot_settings[0].scatter_style.value, 'none');
});
test('full entry still refuses missing invalid styles and malformed points without canvas mutation', () => {
  const valid = chartPreviewPrimitives(actualNone());
  for (const style of [undefined, null, '', 'unsupportedScatterStyle']) {
    const p = structuredClone(valid);
    p.scatter.style = style;
    const c = fullPaint(p);
    assert.equal(c.painted, false, String(style));
    assert.equal(c.calls.length, 0, 'invalid styles fail before paint');
  }
  const malformed = structuredClone(valid);
  malformed.scatter.rows[0].points[0].x = NaN;
  const c = fullPaint(malformed);
  assert.equal(c.painted, false);
  assert.equal(c.calls.length, 0);
});
test('record-derived none full entry preserves explicit supported marker override without source lines', () => {
  // Explicit marker mutation is a source-policy variant, not the captured Native bytes.
  const dto = actualNone();
  dto.series_settings[0].marker = {
    node: 900001,
    symbol: { node: 900002, value: 'square' },
    size: { node: 900003, value: 6 },
  };
  const p = chartPreviewPrimitives(dto);
  assert.equal(p.state, 'ready', JSON.stringify(p));
  assert.equal(p.scatter.rows[0].marker.symbol, 'square');
  assert.equal(fullPaint(p).painted, true);
  const calls = paint(p.scatter);
  assert.equal(
    calls.some(([name]) => ['lineTo', 'bezierCurveTo'].includes(name)),
    false,
  );
  assert.equal(calls.filter(([name]) => name === 'fill').length, p.scatter.rows[0].points.length);
});
