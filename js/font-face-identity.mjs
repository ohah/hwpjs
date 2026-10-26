export const FONT_LANGUAGES = Object.freeze([
  "hangul",
  "latin",
  "hanja",
  "japanese",
  "other",
  "symbol",
  "user",
]);

/** IDs are ordered within language partitions, never globally. */
export function validFontFaceOrder(rows) {
  let previousLanguage = -1,
    previousId = -1;
  for (const row of rows) {
    const language = FONT_LANGUAGES.indexOf(row?.language);
    if (
      language < 0 ||
      language < previousLanguage ||
      !Number.isInteger(row.id) ||
      row.id < 0 ||
      row.id > 0xffffffff ||
      (language === previousLanguage && row.id <= previousId)
    )
      return false;
    previousLanguage = language;
    previousId = row.id;
  }
  return true;
}
