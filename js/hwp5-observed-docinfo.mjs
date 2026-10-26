export function validateObservedDocInfoOption(value, distribution, availableSectionCopy) {
  if (typeof value !== 'boolean') throw new TypeError('Invalid observed DocInfo option');
  if (value && (distribution || availableSectionCopy))
    throw new TypeError('Unsupported observed DocInfo option combination');
}

export function decodeObservedDocInfoDiagnostics(bytes) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (value === null) return null;
  const fields = [
    'absent_carets',
    'unresolved_font_types',
    'unresolved_style_characters',
    'unresolved_character_tails',
    'absent_fill_additionals',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    fields.some(
      (key) => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 0xffffffff,
    ) ||
    typeof value.resource_count_mismatch !== 'boolean'
  )
    throw new Error('InvalidObservedDocInfoDiagnostics');
  return value;
}
