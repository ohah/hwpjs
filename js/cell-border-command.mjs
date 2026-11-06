import { BORDER_WIDTHS_HUNDREDTH_MM } from './border-fill-values.mjs';

// This command intentionally exposes the proven common subset in both formats.
export const CELL_BORDER_STYLES = Object.freeze(['NONE', 'SOLID', 'DOUBLE_SLIM']);
export const CELL_BORDER_WIDTHS = BORDER_WIDTHS_HUNDREDTH_MM;
const styleCodes = new Map(CELL_BORDER_STYLES.map((style, code) => [style, code]));
const widths = new Set(CELL_BORDER_WIDTHS);
const names = Object.freeze([
  'section',
  'tableNode',
  'listNode',
  'edges',
  'style',
  'width',
  'color',
]);
const allowed = new Set(names);

export function cellBorderStyleCode(style) {
  const code = styleCodes.get(style);
  if (code === undefined) throw new RangeError('UnsupportedCellBorderStyle');
  return code;
}

function validate(input, message) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('InvalidCellBorder');
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== names.length + Number(message) ||
    keys.some((key) => !allowed.has(key) && !(message && key === 'kind')) ||
    (message && input.kind !== 'cell-border')
  )
    throw new TypeError('InvalidCellBorder');
  const values = names.map((name) => {
    if (!Object.hasOwn(input, name)) throw new TypeError('InvalidCellBorder');
    const value = input[name];
    if (name === 'style') {
      cellBorderStyleCode(value);
    } else if (name === 'width') {
      if (!widths.has(value)) throw new RangeError('UnsupportedBorderWidth');
    } else {
      const maximum = name === 'color' ? 0xffffff : name === 'edges' ? 15 : 0xffffffff;
      const minimum = name === 'edges' ? 1 : 0;
      if (!Number.isInteger(value) || value < minimum || value > maximum)
        throw new RangeError('InvalidCellBorder');
    }
    return value;
  });
  return Object.freeze(Object.fromEntries(names.map((name, index) => [name, values[index]])));
}

export function validateCellBorder(input) {
  return validate(input, false);
}
export function validateCellBorderMessage(input) {
  return validate(input, true);
}
