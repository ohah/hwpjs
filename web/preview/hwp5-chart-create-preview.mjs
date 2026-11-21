import { validateChartDisplayData } from '../../js/chart-display-data.mjs';
import { chartPreviewPrimitives } from './chart-preview-primitives.mjs';
import { paintChartPreview } from './chart-preview-paint.mjs';
import {
  HWP5_CHART_CREATE_PROFILE,
  hwp5ChartCreateKind,
} from '../../js/hwp5-chart-create-profiles.mjs';

import { HWP5_CHART_LITERAL_BAR_PROFILE, hwp5ChartLiteralKind } from '../../js/hwp5-chart-literal-profiles.mjs';

const fail = (name) => {
  throw Error(name);
};
const live = (current) => {
  if (current() !== true) fail('StaleChartCreatePreview');
};
const validSize = (n) => Number.isSafeInteger(n) && n >= 64 && n <= 2048;
const signature = [137, 80, 78, 71, 13, 10, 26, 10];

/** Render authored Native preview values. Existing resource previewValue caches
 * and test fixture images are never accepted as inputs or used as a fallback.
 * This remains an approximate own preview, not a promise of source-style fidelity.
 */
async function renderPreview(
  wire,
  { width, height },
  { createCanvas, current },
  scope,
  payloadScope,
  expectedKind,
) {
  if (!(wire instanceof Uint8Array) || wire.byteLength === 0 || wire.byteLength > 16 * 1024 * 1024)
    fail('InvalidChartCreatePreview');
  if (!validSize(width) || !validSize(height) || width * height > 4 * 1024 * 1024)
    fail('ChartCreatePreviewPixelLimit');
  if (typeof createCanvas !== 'function' || typeof current !== 'function')
    fail('ChartCreatePreviewRendererUnavailable');
  live(current);
  const preview = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(wire.slice()));
  if (
    preview.schemaVersion !== 1 ||
    preview.scope !== scope ||
    preview.executionAuthority !== false ||
    !Array.isArray(preview.xml_sha256) ||
    preview.xml_sha256.length !== 32 ||
    !preview.xml_sha256.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
  )
    fail('InvalidChartCreatePreview');
  const data = validateChartDisplayData(preview.data);
  if (data.plots.length !== 1 || data.plots[0].kind !== expectedKind)
    fail('UnsupportedChartCreatePreviewKind');
  // Literal editing admits only own markerless standard line output. Never
  // reinterpret arbitrary source style settings as the safe line painter.
  if (scope === 'hwp5-chart-literal-edit-preview' && expectedKind === 'lineChart') {
    const settings = data.plot_settings[0];
    if (settings?.grouping?.value !== 'standard' || settings.direction !== null ||
        settings.spatial !== null || data.view_3d !== null ||
        data.point_settings.length !== 0 || data.rich_text.length !== 0 ||
        data.series_settings.some((s) => s.marker !== null || s.smooth !== null))
      fail('UnsupportedChartLiteralEditProfile');
  }
  const primitives = chartPreviewPrimitives(data);
  if (primitives.state !== 'ready') fail(primitives.reason ?? 'ChartCreatePreviewUnavailable');
  const canvas = createCanvas(width, height);
  if (!canvas) fail('ChartCreatePreviewRendererUnavailable');
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) fail('ChartCreatePreviewRendererUnavailable');
    context.clearRect(0, 0, width, height);
    if (!paintChartPreview(context, { x: 0, y: 0, width, height, primitives }, 0))
      fail('ChartCreatePreviewPaintFailed');
    live(current);
    const blob =
      typeof canvas.convertToBlob === 'function'
        ? await canvas.convertToBlob({ type: 'image/png' })
        : typeof canvas.toBlob === 'function'
          ? await new Promise((resolve, reject) =>
              canvas.toBlob(
                (value) =>
                  value ? resolve(value) : reject(Error('ChartCreatePreviewEncodeFailed')),
                'image/png',
              ),
            )
          : fail('ChartCreatePreviewEncoderUnavailable');
    live(current);
    if (!blob || blob.type !== 'image/png' || blob.size === 0 || blob.size > 8 * 1024 * 1024)
      fail('InvalidChartCreatePreviewPNG');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    live(current);
    if (
      bytes.length < 33 ||
      bytes.length > 8 * 1024 * 1024 ||
      !signature.every((v, i) => bytes[i] === v)
    )
      fail('InvalidChartCreatePreviewPNG');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
      view.getUint32(8) !== 13 ||
      String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR' ||
      view.getUint32(16) !== width ||
      view.getUint32(20) !== height
    )
      fail('InvalidChartCreatePreviewPNG');
    return Object.freeze({
      schemaVersion: 1,
      scope: payloadScope,
      executionAuthority: false,
      source_xml_sha256: Object.freeze([...preview.xml_sha256]),
      rendering: 'hwpjs-preview-approximation',
      warnings: Object.freeze([...(primitives.warnings ?? [])]),
      pixel_width: width,
      pixel_height: height,
      mime: 'image/png',
      bytes,
    });
  } finally {
    // Release the actual transient raster surface; never keep it in a document cache.
    canvas.width = canvas.height = 0;
  }
}

export function renderHwp5ChartCreatePreview(
  wire,
  size,
  host,
  profile = HWP5_CHART_CREATE_PROFILE,
) {
  return renderPreview(
    wire,
    size,
    host,
    'hwp5-chart-create-preview',
    'hwp5-chart-create-preview-payload',
    hwp5ChartCreateKind(profile),
  );
}
export function renderHwp5ChartLiteralEditPreview(wire, host, profile = HWP5_CHART_LITERAL_BAR_PROFILE) {
  if (!(wire instanceof Uint8Array) || !wire.byteLength || wire.byteLength > 16 * 1024 * 1024)
    throw Error('InvalidChartLiteralPreview');
  const p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(wire));
  if (p.changed !== true || (p.profile ?? HWP5_CHART_LITERAL_BAR_PROFILE) !== profile)
    throw Error('InvalidChartLiteralPreview');
  return renderPreview(
    wire,
    { width: p.pixel_width, height: p.pixel_height },
    host,
    'hwp5-chart-literal-edit-preview',
    'hwp5-chart-literal-edit-preview-payload',
    hwp5ChartLiteralKind(profile),
  );
}
