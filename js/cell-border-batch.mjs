import { validateCellBorder, cellBorderStyleCode } from './cell-border-command.mjs';

export const MAX_CELL_BORDER_EDITS = 4096;
export const CELL_BORDER_STRIDE = 28;
export function validateCellBorders(cells) {
  if (!Array.isArray(cells)) throw new TypeError('InvalidCellBorderBatch');
  const length = cells.length;
  if (length > MAX_CELL_BORDER_EDITS) throw new RangeError('LimitExceeded');
  if (Reflect.ownKeys(cells).length !== length + 1) throw new TypeError('InvalidCellBorderBatch');
  const result = [],
    owners = new Set();
  for (let index = 0; index < length; index++) {
    if (!Object.hasOwn(cells, index)) throw new TypeError('InvalidCellBorderBatch');
    const value = validateCellBorder(cells[index]);
    const key = `${value.section}:${value.listNode}`;
    if (owners.has(key)) throw new TypeError('DuplicateCellBorderEdit');
    owners.add(key);
    result.push(value);
  }
  return Object.freeze(result);
}
export function validateCellBordersMessage(message) {
  if (!message || typeof message !== 'object') throw new TypeError('InvalidCellBorderBatch');
  const keys = Reflect.ownKeys(message);
  if (
    keys.length !== 2 ||
    !Object.hasOwn(message, 'kind') ||
    !Object.hasOwn(message, 'cells') ||
    message.kind !== 'cell-borders'
  )
    throw new TypeError('InvalidCellBorderBatch');
  return validateCellBorders(message.cells);
}
export function encodeCellBorders(cells) {
  const values = validateCellBorders(cells);
  const bytes = new Uint8Array(values.length * CELL_BORDER_STRIDE),
    view = new DataView(bytes.buffer);
  values.forEach((v, index) => {
    [
      v.section,
      v.tableNode,
      v.listNode,
      v.edges,
      cellBorderStyleCode(v.style),
      v.width,
      v.color,
    ].forEach((number, field) =>
      view.setUint32(index * CELL_BORDER_STRIDE + field * 4, number, true),
    );
  });
  return bytes;
}
