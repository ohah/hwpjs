/** Detached source margin values, not resolved display insets. */
export function decodeTableCellMargin(bytes) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const bool = (v) => [null, false, true].includes(v);
  const number = (v) =>
    v === null || (Number.isSafeInteger(v) && v >= -0x80000000 && v <= 0xffffffff);
  if (
    !value ||
    !bool(value.has_margin) ||
    !bool(value.header) ||
    !(
      value.margin === null ||
      (Array.isArray(value.margin) && value.margin.length === 4 && value.margin.every(number))
    )
  )
    throw new Error('InvalidTableCellMargin');
  for (const field of ['text_direction', 'line_wrap', 'vertical_alignment']) {
    if (
      value[field] !== undefined &&
      value[field] !== null &&
      !(Number.isInteger(value[field]) && value[field] >= 0 && value[field] <= 2)
    )
      throw new Error('InvalidTableCellMargin');
  }
  return value;
}
