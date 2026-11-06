import { validateCellBorder, cellBorderStyleCode } from './cell-border-command.mjs';
import { MAX_CELL_BORDER_EDITS } from './cell-border-batch.mjs';
import { BORDER_WIDTHS_HUNDREDTH_MM } from './border-fill-values.mjs';

export const CELL_BORDER_PATCH_STRIDE = 32;
const required = ['section', 'tableNode', 'listNode', 'edges'];
const optional = ['style', 'width', 'color'];
const allowed = new Set([...required, ...optional]);
export function validateCellBorderPatches(input) {
  if (!Array.isArray(input)) throw TypeError('InvalidCellBorderPatchBatch');
  const length = input.length;
  if (length > MAX_CELL_BORDER_EDITS) throw RangeError('LimitExceeded');
  if (Reflect.ownKeys(input).length !== length + 1) throw TypeError('InvalidCellBorderPatchBatch');
  const rows = [],
    owners = new Set();
  for (let index = 0; index < length; index++) {
    if (!Object.hasOwn(input, index)) throw TypeError('InvalidCellBorderPatchBatch');
    const source = input[index];
    if (!source || typeof source !== 'object' || Array.isArray(source))
      throw TypeError('InvalidCellBorderPatch');
    const keys = Reflect.ownKeys(source),
      fields = optional.filter((key) => Object.hasOwn(source, key));
    if (
      keys.some((key) => !allowed.has(key)) ||
      required.some((key) => !Object.hasOwn(source, key)) ||
      !fields.length
    )
      throw TypeError('InvalidCellBorderPatch');
    // Defaults validate omitted scalar positions only; they never become write intent.
    const normalized = validateCellBorder({
      section: source.section,
      tableNode: source.tableNode,
      listNode: source.listNode,
      edges: source.edges,
      style: fields.includes('style') ? source.style : 'NONE',
      width: fields.includes('width') ? source.width : BORDER_WIDTHS_HUNDREDTH_MM[0],
      color: fields.includes('color') ? source.color : 0,
    });
    const key = `${normalized.section}:${normalized.listNode}`;
    if (owners.has(key)) throw TypeError('DuplicateCellBorderEdit');
    owners.add(key);
    const row = Object.fromEntries(required.map((key) => [key, normalized[key]]));
    for (const key of fields) row[key] = normalized[key];
    rows.push(Object.freeze(row));
  }
  return Object.freeze(rows);
}
export function encodeCellBorderPatches(input) {
  const rows = validateCellBorderPatches(input),
    bytes = new Uint8Array(rows.length * CELL_BORDER_PATCH_STRIDE),
    view = new DataView(bytes.buffer);
  rows.forEach((row, index) => {
    const mask =
      Number(Object.hasOwn(row, 'style')) |
      (Number(Object.hasOwn(row, 'width')) << 1) |
      (Number(Object.hasOwn(row, 'color')) << 2);
    const fields = [
      row.section,
      row.tableNode,
      row.listNode,
      row.edges,
      mask,
      Object.hasOwn(row, 'style') ? cellBorderStyleCode(row.style) : 0,
      row.width ?? 0,
      row.color ?? 0,
    ];
    fields.forEach((number, field) =>
      view.setUint32(index * CELL_BORDER_PATCH_STRIDE + field * 4, number, true),
    );
  });
  return bytes;
}
