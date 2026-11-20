import {
  checkedInlineObjectTarget,
  checkedInlineObjectSelector,
  matchInlineObjectObservation,
  requireInlineObjectPlacement,
  inlineObjectPlacementAvailable,
} from './hwpx-inline-object-placement.mjs';
import { parseChartDecimal, compareChartDecimals } from './chart-create-decimal.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';

// Transport validation only. Native owns the document, XML, resources and history.
const maxInt = 0x7fffffff;
export { inlineInsertRecord } from './hwpx-inline-object-record.mjs';
import { inlineInsertRecord } from './hwpx-inline-object-record.mjs';

function integer(value, min = 0, max = 0xffffffff) {
  if (!Number.isSafeInteger(value) || value < min || value > max || Object.is(value, -0))
    throw Error('InvalidInlineObjectInteger');
  return value;
}
function text(value, max, empty = false) {
  if (
    typeof value !== 'string' ||
    (!empty && !value.length) ||
    // eslint-disable-next-line no-control-regex -- XML text must reject forbidden controls.
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\uD800-\uDFFF]/u.test(value) ||
    new TextEncoder().encode(value).length > max
  )
    throw Error('InvalidInlineObjectText');
  return value;
}
function list(input, limit, convert, empty = false) {
  if (!Array.isArray(input) || input.length < (empty ? 0 : 1) || input.length > limit)
    throw Error('InvalidInlineObjectArray');
  // Reject holes/accessors and properties that JSON would silently discard.
  const entries = inlineInsertRecord(
    inputRecord(input),
    Array.from({ length: input.length }, (_, i) => String(i)),
  );
  return Array.from({ length: input.length }, (_, i) => convert(entries[String(i)]));
}
function inputRecord(input) {
  const descriptors = Object.getOwnPropertyDescriptors(input);
  delete descriptors.length;
  return Object.defineProperties({}, descriptors);
}
export function checkedEquationInsertOptions(input) {
  const p = inlineInsertRecord(input, [
    'script',
    'width',
    'height',
    'baseLine',
    'baseUnit',
    'version',
    'font',
  ]);
  return {
    script: text(p.script, 1024 * 1024, true),
    width: integer(p.width, 1, maxInt),
    height: integer(p.height, 1, maxInt),
    baseLine: integer(p.baseLine),
    baseUnit: integer(p.baseUnit, 1, maxInt),
    version: text(p.version, 128),
    font: text(p.font, 128),
  };
}
function legacyChartCreateOptions(input) {
  const p = inlineInsertRecord(input, ['width', 'height', 'categories', 'series']);
  const categories = list(p.categories, 4096, (value) => text(value, 4096));
  const series = list(p.series, 64, (value) => {
    const s = inlineInsertRecord(value, ['name', 'values']);
    const values = list(s.values, 4096, (number) => {
      if (typeof number !== 'number' || !Number.isFinite(number)) throw Error('InvalidChartNumber');
      return number;
    });
    if (values.length !== categories.length) throw Error('ChartCategoryCountMismatch');
    return { name: text(s.name, 4096), values };
  });
  if (categories.length * series.length > 16384) throw Error('ChartPointLimitExceeded');
  return {
    width: integer(p.width, 1, maxInt),
    height: integer(p.height, 1, maxInt),
    categories,
    series,
  };
}
export function checkedEquationInsertRequest(input) {
  const optionKeys = ['script', 'width', 'height', 'baseLine', 'baseUnit', 'version', 'font'];
  const fields = Object.getOwnPropertyDescriptors(input ?? {});
  const owner = Object.hasOwn(fields, 'owner');
  const paragraph = Object.hasOwn(fields, 'paragraph');
  const targetKeys = [
    'section',
    ...(paragraph ? ['paragraph'] : []),
    'start',
    'expectedText',
    ...(owner ? ['owner'] : []),
    ...(Object.hasOwn(fields, 'affinity') ? ['affinity'] : []),
  ];
  const p = inlineInsertRecord(input, [...targetKeys, ...optionKeys]);
  const target = checkedInlineObjectTarget(
    Object.fromEntries(targetKeys.map((k) => [k, p[k]])),
    true,
  );
  return {
    ...target,
    expectedText: text(target.expectedText, 8 * 1024 * 1024, true),
    ...checkedEquationInsertOptions(Object.fromEntries(optionKeys.map((k) => [k, p[k]]))),
  };
}
function legacyChartCreatePayload(input) {
  const p = inlineInsertRecord(input, ['size', 'data']);
  const size = inlineInsertRecord(p.size, ['width', 'height']);
  const data = inlineInsertRecord(p.data, ['categories', 'series']);
  const series = list(data.series, 64, (value) => {
    const s = inlineInsertRecord(value, ['name', 'values']);
    return {
      name: s.name,
      values: list(s.values, 4096, (value) => {
        if (
          typeof value !== 'string' ||
          value.length > 32 ||
          !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) ||
          !Number.isFinite(Number(value))
        )
          throw Error('InvalidChartNumber');
        return Number(value);
      }),
    };
  });
  const options = checkedChartCreateOptions({ ...size, categories: data.categories, series });
  return {
    size: { width: options.width, height: options.height },
    data: {
      categories: options.categories,
      series: list(data.series, 64, (value) => {
        const s = inlineInsertRecord(value, ['name', 'values']);
        return { name: s.name, values: list(s.values, 4096, (value) => value) };
      }),
    },
  };
}
function legacyChartCreateRequest(input) {
  const p = inlineInsertRecord(input, ['target', 'size', 'data']);
  const target = checkedInlineObjectTarget(p.target);
  const payload = legacyChartCreatePayload({ size: p.size, data: p.data });
  return {
    target: { ...target, expected_text: text(target.expected_text, 8 * 1024 * 1024, true) },
    ...payload,
  };
}
// Explicit v1 profile contract, shared with Native chart_create_profile.zig.
const chartProfileKeys = {
  barChart: ['bar_direction', 'grouping'],
  bar3DChart: ['bar_direction', 'grouping'],
  lineChart: ['grouping'],
  line3DChart: ['grouping'],
  areaChart: ['grouping'],
  area3DChart: ['grouping'],
  radarChart: ['radar_style'],
  scatterChart: ['scatter_style'],
  bubbleChart: [],
  pieChart: [],
  pie3DChart: [],
  doughnutChart: [],
  ofPieChart: ['of_pie_type'],
  stockChart: ['stock_layout'],
  surfaceChart: ['wireframe'],
  surface3DChart: ['wireframe'],
};
const chartOptionValues = {
  bar_direction: ['col', 'bar'],
  grouping: ['standard', 'clustered', 'stacked', 'percentStacked'],
  radar_style: ['standard', 'marker', 'filled'],
  scatter_style: ['none', 'line', 'lineMarker', 'marker', 'smooth', 'smoothMarker'],
  of_pie_type: ['pie', 'bar'],
  stock_layout: ['highLowClose', 'openHighLowClose'],
};
const hasChart = (input) => !!input && typeof input === 'object' && Object.hasOwn(input, 'chart');
export function checkedChartCreateProfile(input) {
  const kind =
    input && typeof input === 'object'
      ? Object.getOwnPropertyDescriptor(input, 'kind')?.value
      : undefined;
  if (typeof kind !== 'string' || !Object.hasOwn(chartProfileKeys, kind))
    throw Error('InvalidChartCreateProfile');
  const p = inlineInsertRecord(input, ['kind', ...chartProfileKeys[kind]]);
  for (const key of chartProfileKeys[kind]) {
    if (
      key === 'wireframe' ? typeof p[key] !== 'boolean' : !chartOptionValues[key].includes(p[key])
    )
      throw Error('InvalidChartCreateProfile');
  }
  if (p.grouping === 'clustered' && !['barChart', 'bar3DChart'].includes(kind))
    throw Error('InvalidChartCreateProfile');
  return p;
}
function profileData(input, chart, strings) {
  const p = inlineInsertRecord(input, ['categories', 'series']);
  const kind = chart.kind,
    xy = ['scatterChart', 'bubbleChart'].includes(kind);
  const pie = ['pieChart', 'pie3DChart', 'ofPieChart', 'doughnutChart'].includes(kind);
  const stock = kind === 'stockChart';
  const roles =
    chart.stock_layout === 'openHighLowClose'
      ? ['open', 'high', 'low', 'close']
      : ['high', 'low', 'close'];
  const categories = list(p.categories, 4096, (v) => text(v, 4096), xy);
  if (xy && categories.length !== 0) throw Error('InvalidChartCreateShape');
  let points = 0,
    bytes = categories.reduce((n, s) => n + new TextEncoder().encode(s).length, 0);
  const numeric = (value, nonnegative = false) => {
    const valid = strings
      ? typeof value === 'string' &&
        value.length <= 128 &&
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) &&
        Number.isFinite(Number(value))
      : typeof value === 'number' && Number.isFinite(value);
    if (!valid) throw Error('InvalidChartNumber');
    const parsed = parseChartDecimal(String(value));
    if (nonnegative && parsed.negative) throw Error('InvalidChartNumber');
    bytes += String(value).length;
    return value;
  };
  const series = list(p.series, 64, (item) => {
    const keys = [
      'name',
      'values',
      ...(xy ? ['x_values'] : []),
      ...(kind === 'bubbleChart' ? ['bubble_sizes'] : []),
      ...(stock ? ['stock_role'] : []),
    ];
    const row = inlineInsertRecord(item, keys);
    const name = text(row.name, 4096);
    bytes += new TextEncoder().encode(name).length;
    const values = list(row.values, 4096, (n) => numeric(n, pie));
    points += values.length * (kind === 'bubbleChart' ? 3 : 2);
    if (points > 16384) throw Error('ChartPointLimitExceeded');
    if (!xy && values.length !== categories.length) throw Error('ChartCategoryCountMismatch');
    const result = { name, values };
    if (xy) {
      result.x_values = list(row.x_values, 4096, (n) => numeric(n));
      if (result.x_values.length !== values.length) throw Error('InvalidChartCreateShape');
    }
    if (kind === 'bubbleChart') {
      result.bubble_sizes = list(row.bubble_sizes, 4096, (n) => numeric(n, true));
      if (result.bubble_sizes.length !== values.length) throw Error('InvalidChartCreateShape');
    }
    if (stock) result.stock_role = row.stock_role;
    return result;
  });
  if (pie && kind !== 'doughnutChart' && series.length !== 1)
    throw Error('InvalidChartCreateShape');
  if (
    ['surfaceChart', 'surface3DChart'].includes(kind) &&
    (categories.length < 2 || series.length < 2)
  )
    throw Error('InvalidChartCreateShape');
  if (stock) {
    if (series.length !== roles.length || series.some((s, i) => s.stock_role !== roles[i]))
      throw Error('InvalidChartCreateShape');
    const offset = roles.length === 4 ? 1 : 0;
    for (let i = 0; i < categories.length; ++i) {
      const high = String(series[offset].values[i]),
        low = String(series[offset + 1].values[i]);
      const close = String(series[offset + 2].values[i]);
      const open = offset ? String(series[0].values[i]) : close;
      if (
        compareChartDecimals(low, high) > 0 ||
        compareChartDecimals(close, low) < 0 ||
        compareChartDecimals(close, high) > 0 ||
        compareChartDecimals(open, low) < 0 ||
        compareChartDecimals(open, high) > 0
      )
        throw Error('InvalidChartStockValues');
    }
  }
  if (bytes > 4 * 1024 * 1024) throw Error('ChartInputLimitExceeded');
  return { categories, series };
}
export function checkedChartCreateOptions(input) {
  if (!hasChart(input)) return legacyChartCreateOptions(input);
  const p = inlineInsertRecord(input, ['width', 'height', 'categories', 'series', 'chart']);
  const chart = checkedChartCreateProfile(p.chart);
  return {
    width: integer(p.width, 1, maxInt),
    height: integer(p.height, 1, maxInt),
    ...profileData({ categories: p.categories, series: p.series }, chart, false),
    chart,
  };
}
export function checkedChartCreateRequest(input) {
  if (!hasChart(input)) return legacyChartCreateRequest(input);
  const p = inlineInsertRecord(input, ['target', 'size', 'data', 'chart']);
  const target = checkedInlineObjectTarget(p.target);
  const size = inlineInsertRecord(p.size, ['width', 'height']);
  const chart = checkedChartCreateProfile(p.chart);
  return {
    target: {
      ...target,
      expected_text: text(target.expected_text, 8 * 1024 * 1024, true),
    },
    ...profileChartCreatePayload(size, p.data, chart),
  };
}
function profileChartCreatePayload(size, data, chart) {
  return {
    size: { width: integer(size.width, 1, maxInt), height: integer(size.height, 1, maxInt) },
    data: profileData(data, chart, true),
    chart,
  };
}
/** Validate lexical chart data independently of any physical insert target. */
export function checkedChartCreatePayload(input) {
  if (!hasChart(input)) return legacyChartCreatePayload(input);
  const p = inlineInsertRecord(input, ['size', 'data', 'chart']);
  const size = inlineInsertRecord(p.size, ['width', 'height']);
  const chart = checkedChartCreateProfile(p.chart);
  return profileChartCreatePayload(size, p.data, chart);
}
/** Project number DTO to Native lexical strings. Legacy String(-0) stays '0'. */
export function chartCreateWireData(options) {
  return {
    categories: options.categories,
    series: options.series.map((s) => ({
      name: s.name,
      values: s.values.map(String),
      ...(options.chart && Object.hasOwn(s, 'x_values')
        ? { x_values: s.x_values.map(String) }
        : {}),
      ...(options.chart && Object.hasOwn(s, 'bubble_sizes')
        ? { bubble_sizes: s.bubble_sizes.map(String) }
        : {}),
      ...(options.chart && Object.hasOwn(s, 'stock_role') ? { stock_role: s.stock_role } : {}),
    })),
  };
}
export function createHwpxInlineObjectInsertApi({ wasm, memory, check }) {
  const profileVersion = () => {
    check();
    try {
      return typeof wasm.hwpx_edit_create_chart === 'function' &&
        typeof wasm.hwpx_edit_chart_create_profile_version === 'function' &&
        wasm.hwpx_edit_chart_create_profile_version() === 1
        ? 1
        : 0;
    } catch {
      return 0;
    }
  };
  const insert = (name, request) => {
    check();
    if (typeof wasm[name] !== 'function') throw Error('InlineObjectInsertionUnavailable');
    requireInlineObjectPlacement(wasm, request);
    const bytes = new TextEncoder().encode(JSON.stringify(request));
    if (bytes.length > 8 * 1024 * 1024) throw Error('InlineObjectRequestLimitExceeded');
    // Never simulate success/no-op, nor retry after an ambiguous completion.
    return applyNativeEdit(
      memory,
      bytes,
      (ptr, size) => wasm[name](ptr, size),
      'InvalidInlineObjectInsertResult',
    );
  };
  return {
    inlineObjectOwner: (selector) => {
      check();
      if (!inlineObjectPlacementAvailable(wasm)) throw Error('InlineObjectPlacementUnavailable');
      const request = checkedInlineObjectSelector(selector);
      return memory.withBytes(new TextEncoder().encode(JSON.stringify(request)), (ptr, size) => {
        if (wasm.hwpx_edit_inline_object_owner(ptr, size) !== 1) throw memory.error();
        try {
          return matchInlineObjectObservation(
            request,
            JSON.parse(
              new TextDecoder('utf-8', { fatal: true }).decode(
                memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()),
              ),
            ),
          );
        } finally {
          wasm.hwpx_edit_output_free();
        }
      });
    },
    inlineObjectPlacementVersion: () => {
      check();
      return inlineObjectPlacementAvailable(wasm) ? 1 : 0;
    },
    supportsEquationInsertionAbi: () => typeof wasm.hwpx_edit_insert_equation === 'function',
    supportsChartCreationAbi: () => typeof wasm.hwpx_edit_create_chart === 'function',
    insertEquation: (input) =>
      insert('hwpx_edit_insert_equation', checkedEquationInsertRequest(input)),
    chartCreateProfileVersion: () => profileVersion(),
    supportsChartCreateProfileAbi: () => profileVersion() === 1,
    createChart: (input) => {
      const request = checkedChartCreateRequest(input);
      if (request.chart) {
        if (profileVersion() !== 1) throw Error('ChartCreateProfileUnavailable');
      }
      return insert('hwpx_edit_create_chart', request);
    },
  };
}
