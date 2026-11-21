import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHwp5ChartCreatePreview as render } from '../../web/preview/hwp5-chart-create-preview.mjs';
import { model, context } from '../hwpx/chart-family-model.mjs';

// Controlled Native-DTO/encoder mocks, never product fallback assets or visual evidence.
function wire(kind = 'barChart') {
  const data = model(kind, [[10, 20, 30]]);
  delete data.pair;
  delete data.host;
  if (kind === 'barChart') data.plot_settings[0].direction = { node: 4, value: 'col' };
  data.plot_settings[0].grouping = {
    node: 5,
    value: kind === 'barChart' ? 'clustered' : 'standard',
  };
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
const size = { width: 128, height: 96 };
function host({ stale = false, encoder = true, wrongSize = false, noContext = false } = {}) {
  const recording = context();
  let current = true,
    encoded = 0;
  // Deliberately header-only: this test checks adapter routing, not Native PNG validity.
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, wrongSize ? 127 : 128);
  view.setUint32(20, 96);
  const canvas = { getContext: () => (noContext ? null : recording.ctx) };
  if (encoder)
    canvas.convertToBlob = async ({ type }) => {
      assert.equal(type, 'image/png');
      encoded++;
      if (stale) current = false;
      return new Blob([bytes], { type });
    };
  return {
    canvas,
    recording,
    encoded: () => encoded,
    createCanvas: () => canvas,
    current: () => current,
  };
}
test('own painter uses actual bar geometry and encoder, preserving approximate warnings and XML hash', async () => {
  const h = host();
  const out = await render(wire(), size, h);
  assert.equal(out.rendering, 'hwpjs-preview-approximation');
  assert.equal(out.executionAuthority, false);
  assert.deepEqual(out.source_xml_sha256, Array(32).fill(7));
  assert.equal(h.encoded(), 1);
  assert.ok(h.recording.calls.filter(([name]) => name === 'fillRect').length >= 3);
  assert.equal(h.recording.depth(), 0);
  assert.ok(out.warnings.includes('SourceStylesNotApplied'));
  assert.equal(h.canvas.width, 0);
  assert.equal(h.canvas.height, 0);
});
test('missing encoder rejects after real painter with no fixture or cached fallback', async () => {
  const h = host({ encoder: false });
  await assert.rejects(render(wire(), size, h), /ChartCreatePreviewEncoderUnavailable/);
  assert.equal(h.canvas.width, 0);
});
test('revision changes during encoding discard payload and release canvas', async () => {
  const h = host({ stale: true });
  await assert.rejects(render(wire(), size, h), /StaleChartCreatePreview/);
  assert.equal(h.canvas.width, 0);
});
test('encoded PNG dimensions must match the painted surface', async () => {
  const h = host({ wrongSize: true });
  await assert.rejects(render(wire(), size, h), /InvalidChartCreatePreviewPNG/);
  assert.equal(h.canvas.width, 0);
});
test('unsupported family cannot invoke canvas or encoder', async () => {
  let created = 0;
  await assert.rejects(
    render(wire('lineChart'), size, {
      current: () => true,
      createCanvas: () => {
        created++;
      },
    }),
    /UnsupportedChartCreatePreviewKind/,
  );
  assert.equal(created, 0);
});
test('missing graphics context rejects and releases the surface', async () => {
  const h = host({ noContext: true });
  await assert.rejects(render(wire(), size, h), /ChartCreatePreviewRendererUnavailable/);
  assert.equal(h.encoded(), 0);
  assert.equal(h.canvas.width, 0);
});
test('pixel budgets and stale source reject before allocating a canvas', async () => {
  let created = 0;
  const h = {
    current: () => true,
    createCanvas: () => {
      created++;
    },
  };
  await assert.rejects(
    render(wire(), { width: 2049, height: 96 }, h),
    /ChartCreatePreviewPixelLimit/,
  );
  await assert.rejects(
    render(wire(), size, { ...h, current: () => false }),
    /StaleChartCreatePreview/,
  );
  assert.equal(created, 0);
});
