/** Source table policy, not measured splitting or default-value inference. */
export function decodeTablePagination(bytes) {
  const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const optional = (value) => value === null || uint(value);
  if (!Array.isArray(rows)) throw new Error('InvalidTablePagination');
  let previous = -1;
  for (const row of rows) {
    const value = row?.values;
    if (
      !row ||
      !uint(row.table_node) ||
      row.table_node <= previous ||
      !value ||
      ![null, 'none', 'table', 'cell', 'unknown'].includes(value.page_break) ||
      ![null, false, true].includes(value.repeat_header) ||
      ![null, false, true].includes(value.no_adjust) ||
      !optional(value.cell_spacing) ||
      !optional(value.border_fill_id)
    )
      throw new Error('InvalidTablePagination');
    previous = row.table_node;
  }
  return rows;
}
