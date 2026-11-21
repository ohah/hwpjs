import { validateChartDisplayData } from '../../js/chart-display-data.mjs';
import { chartPreviewPrimitives } from './chart-preview-primitives.mjs';
import { paintChartPreview } from './chart-preview-paint.mjs';

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
export async function renderHwp5ChartCreatePreview(
  wire,
  { width, height },
  { createCanvas, current },
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
    preview.scope !== 'hwp5-chart-create-preview' ||
    preview.executionAuthority !== false ||
    !Array.isArray(preview.xml_sha256) ||
    preview.xml_sha256.length !== 32 ||
    !preview.xml_sha256.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
  )
    fail('InvalidChartCreatePreview');
  const data = validateChartDisplayData(preview.data);
  if (data.plots.length !== 1 || data.plots[0].kind !== 'barChart')
    fail('UnsupportedChartCreatePreviewKind');
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
      scope: 'hwp5-chart-create-preview-payload',
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
