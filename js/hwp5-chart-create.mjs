import { checkedHwp5PieValues } from './hwp5-chart-pie-create.mjs';
import { HWP5_CHART_CREATE_ABI } from './abi-schema.mjs';
import { inlineInsertRecord } from './hwpx-inline-object-record.mjs';
import { checkedChartCreateOptions, chartCreateWireData } from './hwpx-inline-object-insert.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
import { renderHwp5ChartCreatePreview } from '../web/preview/hwp5-chart-create-preview.mjs';

import {
  hwp5ChartCreateKind,
  HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE,
  isHwp5ChartCreateProfileVersion,
  supportsHwp5ChartCreateProfile,
} from './hwp5-chart-create-profiles.mjs';

export { HWP5_CHART_CREATE_PROFILE } from './hwp5-chart-create-profiles.mjs';
const encoder = new TextEncoder();
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max)
    throw Error('InvalidHwp5ChartCreateInteger');
  return value;
};
export function checkedHwp5ChartCreateOptions(input) {
  const p = inlineInsertRecord(input, [
    'profile',
    'width',
    'height',
    'categories',
    'series',
    'preview',
  ]);
  const kind = hwp5ChartCreateKind(p.profile);
  const values = checkedChartCreateOptions({
    width: p.width,
    height: p.height,
    categories: p.categories,
    series: p.series,
    ...(kind === 'lineChart' ? { chart: { kind, grouping: 'standard' } } : {}),
    ...(kind === 'pieChart' ? { chart: { kind } } : {}),
    ...(p.profile === HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE
      ? { chart: { kind, bar_direction: 'bar', grouping: 'clustered' } }
      : {}),
  });
  if (kind === 'pieChart') checkedHwp5PieValues(values.series[0].values);
  if (kind === 'lineChart' && values.categories.length < 2)
    throw Error('InvalidChartLineCategoryCount');
  const preview = inlineInsertRecord(p.preview, ['width', 'height']);
  const width = integer(preview.width, 64, 2048),
    height = integer(preview.height, 64, 2048);
  if (width * height > 4 * 1024 * 1024) throw Error('ChartCreatePreviewPixelLimit');
  const aspectMatches =
    values.width >= values.height
      ? height === Math.floor((width * values.height + Math.floor(values.width / 2)) / values.width)
      : width ===
        Math.floor((height * values.width + Math.floor(values.height / 2)) / values.height);
  if (!aspectMatches) throw Error('InvalidHwp5ChartPreviewAspect');
  return Object.freeze({
    width: values.width,
    height: values.height,
    profile: p.profile,
    preview: Object.freeze({ width, height }),
    categories: Object.freeze([...values.categories]),
    series: Object.freeze(
      values.series.map((s) =>
        Object.freeze({ name: s.name, values: Object.freeze([...s.values]) }),
      ),
    ),
  });
}
const bytesFor = (value, limit) => {
  const bytes = encoder.encode(JSON.stringify(value));
  if (bytes.length === 0 || bytes.length > limit) throw Error('LimitExceeded');
  return bytes;
};
const equal = (left, right) => left.length === right.length && left.every((v, i) => v === right[i]);

/** A scoped current reference and trusted Canvas host are required. The actual
 * shared model painter always runs here; callers cannot substitute PNG payloads.
 * Native repeats owner/epoch/source/hash/image checks before atomic publication.
 */
export function createHwp5ChartCreateApi({
  wasm,
  memory,
  ready,
  check,
  encode,
  copyCurrentText,
  output,
  u32,
}) {
  const profileVersion = () => {
    check();
    try {
      ready();
    } catch {
      return 0;
    }
    for (const [name, signature] of Object.entries(HWP5_CHART_CREATE_ABI))
      if (typeof wasm[name] !== 'function' || wasm[name].length !== signature.params.length)
        return 0;
    const version = wasm.hwp5_edit_chart_create_profile_version();
    return isHwp5ChartCreateProfileVersion(version) ? version : 0;
  };
  const prepare = (input) => {
    ready();
    const version = profileVersion();
    if (!version) throw Error('InlineObjectInsertionUnavailable');
    const { reference, start, ...raw } = inlineInsertRecord(input, [
      'reference',
      'start',
      'profile',
      'width',
      'height',
      'categories',
      'series',
      'preview',
    ]);
    // encode owns the editor-scope fence; do not rebuild/strip the reference.
    const referenceBytes = encode(reference).slice();
    if (!['original', 'generated'].includes(reference.kind))
      throw Error('UnsupportedChartInsertOwner');
    const unit = u32(start, 'start');
    const options = checkedHwp5ChartCreateOptions(raw);
    if (!supportsHwp5ChartCreateProfile(version, options.profile))
      throw Error('UnsupportedChartCreateProfile');
    const expected = copyCurrentText(reference).slice();
    if (expected.length > 1024 * 1024) throw Error('ChartCreateExpectedTextLimit');
    const data = chartCreateWireData(options);
    const request = bytesFor({ start: unit, profile: options.profile, data }, 4 * 1024 * 1024);
    const wire = memory.withBytes(referenceBytes, (refPtr, refSize) =>
      memory.withBytes(request, (ptr, size) =>
        output(() => wasm.hwp5_edit_chart_create_preview(refPtr, refSize, ptr, size)).bytes.slice(),
      ),
    );
    return { reference, referenceBytes, unit, options, expected, data, wire };
  };
  return {
    supportsChartCreationAbi() {
      return profileVersion() !== 0;
    },
    chartCreateProfileVersion() {
      return profileVersion();
    },
    chartCreatePreview(input) {
      return prepare(input).wire.slice();
    },
    async createChart(input, renderer) {
      ready();
      if (!profileVersion()) throw Error('InlineObjectInsertionUnavailable');
      if (!renderer || typeof renderer.createCanvas !== 'function')
        throw Error('ChartCreatePreviewRendererUnavailable');
      const { reference, referenceBytes, unit, options, expected, data, wire } = prepare(input);
      const current = () => {
        try {
          ready();
          return (
            supportsHwp5ChartCreateProfile(profileVersion(), options.profile) &&
            (!renderer.current || renderer.current() === true) &&
            equal(expected, copyCurrentText(reference))
          );
        } catch {
          return false;
        }
      };
      const painted = await renderHwp5ChartCreatePreview(
        wire,
        options.preview,
        {
          createCanvas: renderer.createCanvas,
          current,
        },
        options.profile,
      );
      if (!current()) throw Error('StaleChartCreatePreview');
      const body = bytesFor(
        {
          start: unit,
          profile: options.profile,
          width: options.width,
          height: options.height,
          expected_text_utf16le: [...expected],
          data,
          source_xml_sha256: painted.source_xml_sha256,
          pixel_width: painted.pixel_width,
          pixel_height: painted.pixel_height,
        },
        16 * 1024 * 1024,
      );
      let outcome;
      try {
        return memory.withBytes(referenceBytes, (refPtr, refSize) =>
          memory.withBytes(painted.bytes, (imagePtr, imageSize) => {
            outcome = applyNativeEdit(
              memory,
              body,
              (ptr, size) =>
                wasm.hwp5_edit_create_chart_current(
                  refPtr,
                  refSize,
                  ptr,
                  size,
                  imagePtr,
                  imageSize,
                ),
              'InvalidHwp5ChartCreateResult',
            );
            return {
              ...outcome,
              chartPreviewWarnings: painted.warnings,
              chartPreviewRendering: painted.rendering,
            };
          }),
        );
      } catch (error) {
        if (!outcome) throw error;
        return { ...outcome, cleanupError: error?.message || String(error), refreshRequired: true };
      }
    },
  };
}
