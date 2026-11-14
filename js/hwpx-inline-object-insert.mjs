import { applyNativeEdit } from './native-edit-outcome.mjs';

// Transport validation only. Native owns the document, XML, resources and history.
const maxInt = 0x7fffffff;
export function inlineInsertRecord(input, keys) {
  if (
    !input ||
    typeof input !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw Error('InvalidInlineObjectRequest');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length)
    throw Error('InvalidInlineObjectRequest');
  const result = {};
  for (const key of keys) {
    const entry = descriptors[key];
    if (!entry || !Object.hasOwn(entry, 'value')) throw Error('InvalidInlineObjectRequest');
    result[key] = entry.value;
  }
  return result;
}
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
function list(input, limit, convert) {
  if (!Array.isArray(input) || input.length < 1 || input.length > limit)
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
export function checkedChartCreateOptions(input) {
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
  const p = inlineInsertRecord(input, [
    'section',
    'paragraph',
    'start',
    'expectedText',
    'script',
    'width',
    'height',
    'baseLine',
    'baseUnit',
    'version',
    'font',
  ]);
  return {
    section: integer(p.section, 0, 0),
    paragraph: integer(p.paragraph, 1),
    start: integer(p.start),
    expectedText: text(p.expectedText, 8 * 1024 * 1024, true),
    ...checkedEquationInsertOptions(
      Object.fromEntries(
        ['script', 'width', 'height', 'baseLine', 'baseUnit', 'version', 'font'].map((k) => [
          k,
          p[k],
        ]),
      ),
    ),
  };
}
export function checkedChartCreateRequest(input) {
  const p = inlineInsertRecord(input, ['target', 'size', 'data']);
  const t = inlineInsertRecord(p.target, ['section', 'paragraph', 'unit', 'expected_text']);
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
    target: {
      section: integer(t.section, 0, 0),
      paragraph: integer(t.paragraph, 1),
      unit: integer(t.unit),
      expected_text: text(t.expected_text, 8 * 1024 * 1024, true),
    },
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
export function createHwpxInlineObjectInsertApi({ wasm, memory, check }) {
  const insert = (name, request) => {
    check();
    if (typeof wasm[name] !== 'function') throw Error('InlineObjectInsertionUnavailable');
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
    supportsEquationInsertionAbi: () => typeof wasm.hwpx_edit_insert_equation === 'function',
    supportsChartCreationAbi: () => typeof wasm.hwpx_edit_create_chart === 'function',
    insertEquation: (input) =>
      insert('hwpx_edit_insert_equation', checkedEquationInsertRequest(input)),
    createChart: (input) => insert('hwpx_edit_create_chart', checkedChartCreateRequest(input)),
  };
}
