import { MAX_CELL_BORDER_EDITS } from './cell-border-batch.mjs';

export const CELL_FILL_STRIDE = 48;
export const CELL_HATCH_STYLES = Object.freeze([
  'HORIZONTAL',
  'VERTICAL',
  'BACK_SLASH',
  'SLASH',
  'CROSS',
  'CROSS_DIAGONAL',
]);
const hatchCodes = new Map(CELL_HATCH_STYLES.map((value, index) => [value, index]));
function exact(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw TypeError('InvalidCellFill');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || names.some((name) => !Object.hasOwn(value, name)))
    throw TypeError('InvalidCellFill');
}
function number(value, maximum) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) throw RangeError('InvalidCellFill');
  return value;
}
function tuple(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    Reflect.ownKeys(value).length !== 3 ||
    !Object.hasOwn(value, 0) ||
    !Object.hasOwn(value, 1)
  )
    throw TypeError('InvalidCellFill');
  return Object.freeze([number(value[0], 0xffffff), number(value[1], 0xffffff)]);
}
export function validateCellFill(input) {
  if (!input || typeof input !== 'object') throw TypeError('InvalidCellFill');
  const kind = input.kind;
  switch (kind) {
    case 'none':
      exact(input, ['kind']);
      return Object.freeze({ kind });
    case 'solid':
      exact(input, ['kind', 'color']);
      return Object.freeze({ kind, color: number(input.color, 0xffffff) });
    case 'hatch': {
      exact(input, ['kind', 'face', 'hatch', 'style']);
      const style = input.style;
      if (!hatchCodes.has(style)) throw TypeError('InvalidCellFill');
      return Object.freeze({
        kind,
        face: number(input.face, 0xffffff),
        hatch: number(input.hatch, 0xffffff),
        style,
      });
    }
    case 'linear':
      exact(input, ['kind', 'colors', 'angle', 'centerX', 'centerY', 'step', 'stepCenter']);
      return Object.freeze({
        kind,
        colors: tuple(input.colors),
        angle: number(input.angle, 359),
        centerX: number(input.centerX, 100),
        centerY: number(input.centerY, 100),
        step: number(input.step, 100),
        stepCenter: number(input.stepCenter, 100),
      });
    default:
      throw TypeError('InvalidCellFill');
  }
}
export function validateCellFills(input) {
  if (!Array.isArray(input)) throw TypeError('InvalidCellFillBatch');
  const length = input.length;
  if (length > MAX_CELL_BORDER_EDITS) throw RangeError('LimitExceeded');
  if (Reflect.ownKeys(input).length !== length + 1) throw TypeError('InvalidCellFillBatch');
  const owners = new Set(),
    values = [];
  for (let index = 0; index < length; index++) {
    if (!Object.hasOwn(input, index)) throw TypeError('InvalidCellFillBatch');
    const source = input[index];
    exact(source, ['section', 'tableNode', 'listNode', 'fill']);
    const section = number(source.section, 0xffffffff),
      tableNode = number(source.tableNode, 0xffffffff),
      listNode = number(source.listNode, 0xffffffff),
      fill = validateCellFill(source.fill),
      key = `${section}:${listNode}`;
    if (owners.has(key)) throw TypeError('DuplicateCellFillEdit');
    owners.add(key);
    values.push(Object.freeze({ section, tableNode, listNode, fill }));
  }
  return Object.freeze(values);
}
export function encodeCellFills(input) {
  const rows = validateCellFills(input),
    bytes = new Uint8Array(rows.length * CELL_FILL_STRIDE),
    view = new DataView(bytes.buffer);
  rows.forEach((row, index) => {
    const fill = row.fill,
      fields = [row.section, row.tableNode, row.listNode, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (fill.kind === 'solid') {
      fields[3] = 1;
      fields[4] = fill.color;
    }
    if (fill.kind === 'hatch') {
      fields[3] = 2;
      fields[4] = fill.face;
      fields[5] = fill.hatch;
      fields[6] = hatchCodes.get(fill.style);
    }
    if (fill.kind === 'linear') {
      fields[3] = 3;
      fields.splice(
        4,
        7,
        ...fill.colors,
        fill.angle,
        fill.centerX,
        fill.centerY,
        fill.step,
        fill.stepCenter,
      );
    }
    fields.forEach((value, field) =>
      view.setUint32(index * CELL_FILL_STRIDE + field * 4, value, true),
    );
  });
  return bytes;
}
