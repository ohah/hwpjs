/** Explicit display insets in pixels; missing source values have no defaults. */
export function tableInsets(value) {
  const insets = typeof value === "number" ? { left: value, right: value, top: value, bottom: value } : value;
  if (!insets || ![insets.left, insets.right, insets.top, insets.bottom].every(v => Number.isFinite(v) && v >= 0) || !Number.isFinite(insets.left + insets.right) || !Number.isFinite(insets.top + insets.bottom)) return null;
  return { left: insets.left, right: insets.right, top: insets.top, bottom: insets.bottom };
}

export function tableCellInsets(value, cell) {
  return tableInsets(value instanceof Map ? value.get(cell.listNode) : value);
}
