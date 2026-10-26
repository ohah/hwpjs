const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const parse = (bytes) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
export function decodeHwp5ParagraphFlow(bytes) {
  const rows = parse(bytes);
  if (!Array.isArray(rows)) throw new Error('InvalidHwp5ParagraphFlow');
  for (const [index, row] of rows.entries()) {
    if (
      row?.empty_line_eligible !== undefined &&
      (typeof row.empty_line_eligible !== 'boolean' ||
        (row.empty_line_eligible && row.top_level !== true))
    )
      throw new Error('InvalidHwp5ParagraphFlow');
    if (row && (Object.hasOwn(row, 'memo_index') || Object.hasOwn(row, 'memo_node'))) {
      if (
        !(row.memo_index === null && row.memo_node === null) &&
        !(
          uint(row.memo_index) &&
          uint(row.memo_node) &&
          row.host === 'other' &&
          row.top_level === false &&
          uint(row.list_node) &&
          row.memo_node + 1 === row.list_node
        )
      )
        throw new Error('InvalidHwp5ParagraphFlow');
    }
    if (row?.host !== undefined) {
      if (
        ![
          'body',
          'table_cell',
          'table_caption',
          'header',
          'footer',
          'footnote',
          'endnote',
          'master_page',
          'drawing',
          'other',
        ].includes(row.host) ||
        !(row.list_node === null || uint(row.list_node)) ||
        row.top_level !== (row.host === 'body') ||
        (row.host === 'body') !== (row.list_node === null)
      )
        throw new Error('InvalidHwp5ParagraphFlow');
    }
    if (
      !row ||
      row.paragraph !== index ||
      !uint(row.template_node) ||
      !(row.source_node === null || uint(row.source_node)) ||
      !(row.parent_node === null || uint(row.parent_node)) ||
      !Number.isInteger(row.break_flags) ||
      row.break_flags < 0 ||
      row.break_flags > 255 ||
      typeof row.generated !== 'boolean' ||
      row.generated !== (row.source_node === null) ||
      row.top_level !== (row.parent_node === null) ||
      (row.generated &&
        (![0, 4, 8].includes(row.break_flags) || (row.break_flags !== 0 && !row.top_level))) ||
      (!row.generated && row.source_node !== row.template_node)
    )
      throw new Error('InvalidHwp5ParagraphFlow');
    for (const [name, mask] of [
      ['section_break', 1],
      ['multicolumn_break', 2],
      ['page_break', 4],
      ['column_break', 8],
    ])
      if (row[name] !== Boolean(row.break_flags & mask))
        throw new Error('InvalidHwp5ParagraphFlow');
  }
  return rows;
}
export function decodeHwp5ColumnSources(bytes) {
  const rows = parse(bytes);
  if (!Array.isArray(rows)) throw new Error('InvalidHwp5ColumnSources');
  for (const row of rows) {
    if (!row || !uint(row.current_paragraph) || !uint(row.current_unit))
      throw new Error('InvalidHwp5ColumnSources');
    if (
      !row ||
      !['source_node', 'paragraph_node', 'flags', 'color', 'extra_bytes'].every((name) =>
        uint(row[name]),
      ) ||
      !Number.isInteger(row.count) ||
      row.count < 1 ||
      row.count > 255 ||
      ![0, 1, 2, 3].includes(row.kind) ||
      ![0, 1, 2, 3].includes(row.direction) ||
      typeof row.same_width !== 'boolean' ||
      !(
        row.spacing === null ||
        (Number.isInteger(row.spacing) && row.spacing >= -32768 && row.spacing <= 32767)
      ) ||
      ![row.line_type, row.line_width].every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 255,
      ) ||
      !Array.isArray(row.columns)
    )
      throw new Error('InvalidHwp5ColumnSources');
    if (
      ((row.flags >>> 2) & 255) !== row.count ||
      (row.flags & 3) !== row.kind ||
      ((row.flags >>> 10) & 3) !== row.direction ||
      Boolean(row.flags & 4096) !== row.same_width ||
      row.columns.length !== (row.count < 2 || row.same_width ? 0 : row.count) ||
      row.columns.length > 0 !== (row.spacing === null)
    )
      throw new Error('InvalidHwp5ColumnSources');
    for (const value of row.columns)
      if (
        !value ||
        ![value.width, value.gap].every(
          (number) => Number.isInteger(number) && number >= 0 && number <= 65535,
        )
      )
        throw new Error('InvalidHwp5ColumnSources');
  }
  return rows;
}
