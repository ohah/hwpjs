export function decodeHwp5SectionSettings(bytes) {
  const row = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const uint = (value, max = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= max;
  if (
    !row ||
    !['source_node', 'flags', 'tab_spacing', 'extra_bytes'].every((key) => uint(row[key])) ||
    !['column_gap', 'vertical_grid', 'horizontal_grid'].every(
      (key) => Number.isInteger(row[key]) && row[key] >= -32768 && row[key] <= 32767,
    ) ||
    !['numbering_id', 'page_start', 'picture_start', 'table_start', 'equation_start'].every((key) =>
      uint(row[key], 65535),
    ) ||
    !(row.language === null || uint(row.language, 65535)) ||
    typeof row.extra_nonzero !== 'boolean' ||
    (row.extra_bytes === 0 && row.extra_nonzero)
  )
    throw new Error('InvalidHwp5SectionSettings');
  if (
    Object.hasOwn(row, 'extra_raw') &&
    (!Array.isArray(row.extra_raw) ||
      row.extra_raw.length !== row.extra_bytes ||
      !Array.from(row.extra_raw).every((byte) => uint(byte, 255)) ||
      row.extra_raw.some((byte) => byte !== 0) !== row.extra_nonzero)
  )
    throw new Error('InvalidHwp5SectionSettings');
  if (
    Object.hasOwn(row, 'memo_shape_count') &&
    row.memo_shape_count !== null &&
    !uint(row.memo_shape_count)
  )
    throw new Error('InvalidHwp5SectionSettings');
  if (Object.hasOwn(row, 'memo_list_count') && !uint(row.memo_list_count))
    throw new Error('InvalidHwp5SectionSettings');
  if (Object.hasOwn(row, 'observed_extension') && row.observed_extension !== null) {
    const extension = row.observed_extension;
    if (
      !extension ||
      typeof extension !== 'object' ||
      Array.isArray(extension) ||
      row.language === null ||
      row.extra_bytes !== 17 ||
      !Array.isArray(row.extra_raw)
    )
      throw new Error('InvalidHwp5SectionSettings');
    const view = new DataView(Uint8Array.from(row.extra_raw).buffer);
    // Cross-check wire metadata against its retained source, not a second file parser.
    for (const [key, offset, method] of [
      ['leading_count_raw', 0, 'getUint32'],
      ['memo_shape_id_ref', 4, 'getUint16'],
      ['flags_raw', 6, 'getUint16'],
      ['line_number_restart_raw', 8, 'getUint8'],
      ['line_number_count_by', 9, 'getUint16'],
      ['line_number_distance_raw', 11, 'getUint32'],
      ['line_number_start', 15, 'getUint16'],
    ]) {
      if (extension[key] !== view[method](offset, true))
        throw new Error('InvalidHwp5SectionSettings');
    }
    const direction = (extension.flags_raw >>> 1) & 7;
    const hasDirection = [
      'text_direction_raw',
      'text_direction',
      'text_vertical_width_head',
      'unknown_flags',
    ].some((key) => Object.hasOwn(extension, key));
    if (
      hasDirection &&
      (extension.text_direction_raw !== direction ||
        extension.text_direction !==
          (['HORIZONTAL', 'VERTICAL', 'VERTICALALL'][direction] ?? null) ||
        extension.text_vertical_width_head !== Boolean(extension.flags_raw & 0x10) ||
        extension.unknown_flags !== (extension.flags_raw & 0xffe1))
    )
      throw new Error('InvalidHwp5SectionSettings');
    if (
      !Array.isArray(extension.trailing_raw) ||
      extension.trailing_raw.length !== 11 ||
      Array.from(extension.trailing_raw).some((byte, index) => byte !== row.extra_raw[index + 6])
    )
      throw new Error('InvalidHwp5SectionSettings');
  }
  return row;
}
