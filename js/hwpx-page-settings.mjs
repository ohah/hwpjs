/** Source observations, not a page layout or default-value resolver. */
function validateColumn(column) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (
    !column ||
    !uint(column.declaration_node) ||
    !uint(column.owner_node) ||
    ![column.count, column.gap].every((value) => value === null || uint(value)) ||
    ![null, true, false].includes(column.same_size) ||
    ![null, 'left', 'right', 'mirror'].includes(column.direction) ||
    ![null, 'newspaper', 'balanced_newspaper', 'parallel'].includes(column.kind) ||
    typeof column.ambiguous !== 'boolean'
  )
    throw new Error('InvalidParagraphFlow');
  if (
    column.sizes !== undefined &&
    (!Array.isArray(column.sizes) ||
      column.sizes.some(
        (size) => !size || ![size.width, size.gap].every((value) => value === null || uint(value)),
      ))
  )
    throw new Error('InvalidParagraphFlow');
}

export function decodeParagraphFlow(bytes) {
  const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!Array.isArray(rows)) throw new Error('InvalidParagraphFlow');
  for (const row of rows) {
    if (!row) throw new Error('InvalidParagraphFlow');
    if (row.empty_line_eligible !== undefined && typeof row.empty_line_eligible !== 'boolean')
      throw new Error('InvalidParagraphFlow');
    if (row.note_context !== undefined && row.note_context !== null) {
      const note = row.note_context;
      if (
        ![note.note_node, note.list_node].every(
          (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
        ) ||
        !['footnote', 'endnote'].includes(note.kind) ||
        row.host !== note.kind ||
        row.top_level !== false
      )
        throw new Error('InvalidParagraphFlow');
    }
    if (row.single_column !== undefined && typeof row.single_column !== 'boolean')
      throw new Error('InvalidParagraphFlow');
    if (
      row.host !== undefined &&
      !['body', 'header', 'footer', 'footnote', 'endnote', 'drawing', 'other'].includes(row.host)
    )
      throw new Error('InvalidParagraphFlow');
    if (row.column_declaration !== undefined && row.column_declaration !== null) {
      validateColumn(row.column_declaration);
    }
    if (row.column_start_declaration !== undefined && row.column_start_declaration !== null) {
      validateColumn(row.column_start_declaration);
    }
    if (row.column_changes !== undefined) {
      if (!Array.isArray(row.column_changes)) throw new Error('InvalidParagraphFlow');
      let previous = 0;
      for (const change of row.column_changes) {
        if (
          !change ||
          !Number.isInteger(change.unit) ||
          change.unit < previous ||
          change.unit > 0xffffffff
        )
          throw new Error('InvalidParagraphFlow');
        validateColumn(change.declaration);
        previous = change.unit;
      }
    }
    if (row.page_number_source !== undefined && row.page_number_source !== null) {
      const source = row.page_number_source;
      if (
        typeof source.supported !== 'boolean' ||
        (source.start_page !== null &&
          (!Number.isInteger(source.start_page) ||
            source.start_page < 1 ||
            source.start_page > 0xffffffff)) ||
        ![null, true, false].includes(source.hide_first_header) ||
        ![null, true, false].includes(source.hide_first_footer)
      )
        throw new Error('InvalidParagraphFlow');
    }
    if (row.page_area !== undefined && row.page_area !== null) {
      const area = row.page_area;
      const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
      if (
        !area ||
        !uint(area.owner_node) ||
        !uint(area.list_node) ||
        ![area.width, area.height].every((value) => value === null || uint(value)) ||
        ![null, 'both', 'odd', 'even'].includes(area.apply) ||
        ![null, 'top', 'center', 'bottom'].includes(area.vertical_alignment)
      )
        throw new Error('InvalidParagraphFlow');
    }
    if (
      !row ||
      !Number.isInteger(row.paragraph) ||
      row.paragraph <= 0 ||
      row.paragraph > 0xffffffff ||
      !Number.isInteger(row.source_node) ||
      row.source_node < 0 ||
      row.source_node > 0xffffffff ||
      typeof row.top_level !== 'boolean' ||
      ![null, true, false].includes(row.page_break) ||
      ![null, true, false].includes(row.column_break)
    )
      throw new Error('InvalidParagraphFlow');
  }
  if (rows.some((row, i) => i > 0 && row.paragraph !== rows[i - 1].paragraph + 1))
    throw new Error('InvalidParagraphFlow');
  return rows;
}

export function decodePageSettings(bytes) {
  const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const optional = (value) => value === null || uint(value);
  if (!Array.isArray(rows)) throw new Error('InvalidPageSettings');
  for (const row of rows) {
    if (
      !row ||
      !uint(row.section_ordinal) ||
      !uint(row.element_index) ||
      !uint(row.duplicate_margins) ||
      !optional(row.width) ||
      !optional(row.height) ||
      ![null, 'widely', 'narrowly'].includes(row.orientation) ||
      ![null, 'left_only', 'left_right', 'top_bottom'].includes(row.gutter_type)
    )
      throw new Error('InvalidPageSettings');
    if (
      row.hide_first_empty_line !== undefined &&
      ![null, true, false].includes(row.hide_first_empty_line)
    )
      throw new Error('InvalidPageSettings');
    if (Object.hasOwn(row, 'hide_first_empty_line') !== Object.hasOwn(row, 'visibility_count'))
      throw new Error('InvalidPageSettings');
    if (
      row.visibility_count !== undefined &&
      (!uint(row.visibility_count) ||
        (row.visibility_count !== 1 && row.hide_first_empty_line != null))
    )
      throw new Error('InvalidPageSettings');
    if (
      row.margin !== null &&
      (!row.margin ||
        !['header', 'footer', 'gutter', 'left', 'right', 'top', 'bottom'].every((name) =>
          optional(row.margin[name]),
        ))
    )
      throw new Error('InvalidPageSettings');
  }
  return rows;
}
