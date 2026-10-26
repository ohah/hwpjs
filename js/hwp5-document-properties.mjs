export function validateHwp5DocumentProperties(value) {
  const uint = (number, max) => Number.isInteger(number) && number >= 0 && number <= max;
  if (
    !value ||
    !['source_record', 'caret_list', 'caret_paragraph', 'caret_character', 'extra_bytes'].every(
      (key) => uint(value[key], 0xffffffff),
    ) ||
    ![
      'section_count',
      'page_start',
      'footnote_start',
      'endnote_start',
      'picture_start',
      'table_start',
      'equation_start',
    ].every((key) => uint(value[key], 0xffff)) ||
    typeof value.extra_nonzero !== 'boolean' ||
    (value.extra_bytes === 0 && value.extra_nonzero)
  )
    throw new Error('InvalidHwp5DocumentProperties');
  return value;
}
export function decodeHwp5DocumentProperties(bytes) {
  return validateHwp5DocumentProperties(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
