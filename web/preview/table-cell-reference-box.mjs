/** Final cell-local COLUMN reference; outer page/column ownership stays separate. */
export function tableCellReferenceBox(box, insets, flow, ordinal) {
  if (!box || !insets || !flow || ![box.x, box.y, box.width, box.height, insets.left, insets.right, insets.top, insets.bottom].every(Number.isFinite)
    || [insets.left, insets.right, insets.top, insets.bottom].some(value => value < 0)) return null;
  const inner = { x: box.x + insets.left, y: box.y + insets.top, width: box.width - insets.left - insets.right, height: box.height - insets.top - insets.bottom };
  if (![inner.x, inner.y, inner.width, inner.height, inner.x + inner.width, inner.y + inner.height].every(Number.isFinite) || inner.width <= 0 || inner.height <= 0) return null;
  if (flow.columns === undefined) return ordinal === undefined ? inner : null;
  if (!Array.isArray(flow.columns) || !Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= flow.columns.length) return null;
  const column = flow.columns[ordinal];
  if (!column || ![column.x, column.y, column.width, column.height].every(Number.isFinite) || column.width <= 0 || column.height <= 0
    || column.x < 0 || column.y < 0 || column.x + column.width > inner.width + 1e-8 || column.y + column.height > inner.height + 1e-8) return null;
  return { ...column, x: inner.x + column.x, y: inner.y + column.y };
}
