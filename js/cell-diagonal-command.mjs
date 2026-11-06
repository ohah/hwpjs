import { MAX_CELL_BORDER_EDITS } from './cell-border-batch.mjs';
import { validateCellBorder, cellBorderStyleCode } from './cell-border-command.mjs';
import { BORDER_WIDTHS_HUNDREDTH_MM } from './border-fill-values.mjs';
import { TABLE_DIAGONAL_DIRECTIONS } from './table-diagonal-directions.mjs';

export const CELL_DIAGONAL_STRIDE = 48;
const required = ['section', 'tableNode', 'listNode'];
const optional = ['directions', 'style', 'width', 'color'];
const allowed = new Set([...required, ...optional]);
export function validateCellDiagonals(input) {
  if (!Array.isArray(input)) throw TypeError('InvalidCellDiagonalBatch');
  const length = input.length;
  if (length > MAX_CELL_BORDER_EDITS) throw RangeError('LimitExceeded');
  if (Reflect.ownKeys(input).length !== length + 1) throw TypeError('InvalidCellDiagonalBatch');
  const owners = new Set(),
    rows = [];
  for (let index = 0; index < length; index++) {
    if (!Object.hasOwn(input, index)) throw TypeError('InvalidCellDiagonalBatch');
    const source = input[index];
    if (!source || typeof source !== 'object' || Array.isArray(source))
      throw TypeError('InvalidCellDiagonal');
    const fields = optional.filter((key) => Object.hasOwn(source, key));
    if (
      !fields.length ||
      required.some((key) => !Object.hasOwn(source, key)) ||
      Reflect.ownKeys(source).some((key) => !allowed.has(key))
    )
      throw TypeError('InvalidCellDiagonal');
    const directions = fields.includes('directions') ? source.directions : undefined;
    if (fields.includes('directions') && !TABLE_DIAGONAL_DIRECTIONS.includes(directions))
      throw TypeError('InvalidCellDiagonal');
    // Omitted validation scalars never become edit intent.
    const normalized = validateCellBorder({
      section: source.section,
      tableNode: source.tableNode,
      listNode: source.listNode,
      edges: 1,
      style: fields.includes('style') ? source.style : 'NONE',
      width: fields.includes('width') ? source.width : BORDER_WIDTHS_HUNDREDTH_MM[0],
      color: fields.includes('color') ? source.color : 0,
    });
    const key = `${normalized.section}:${normalized.listNode}`;
    if (owners.has(key)) throw TypeError('DuplicateCellDiagonalEdit');
    owners.add(key);
    const row = Object.fromEntries(required.map((key) => [key, normalized[key]]));
    for (const key of fields) row[key] = key === 'directions' ? directions : normalized[key];
    rows.push(Object.freeze(row));
  }
  return Object.freeze(rows);
}
export function encodeCellDiagonals(input) {
  const rows = validateCellDiagonals(input),
    bytes = new Uint8Array(rows.length * CELL_DIAGONAL_STRIDE),
    view = new DataView(bytes.buffer);
  rows.forEach((row, index) => {
    const mask =
      Number(Object.hasOwn(row, 'directions')) |
      (Number(Object.hasOwn(row, 'style')) << 1) |
      (Number(Object.hasOwn(row, 'width')) << 2) |
      (Number(Object.hasOwn(row, 'color')) << 3);
    const words = [
      row.section,
      row.tableNode,
      row.listNode,
      mask,
      Object.hasOwn(row, 'directions') ? TABLE_DIAGONAL_DIRECTIONS.indexOf(row.directions) : 0,
      Object.hasOwn(row, 'style') ? cellBorderStyleCode(row.style) : 0,
      row.width ?? 0,
      row.color ?? 0,
      0,
      0,
      0,
      0,
    ];
    words.forEach((value, word) =>
      view.setUint32(index * CELL_DIAGONAL_STRIDE + word * 4, value, true),
    );
  });
  return bytes;
}
