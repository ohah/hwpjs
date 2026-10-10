export const FONT_LANGUAGES = Object.freeze(["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"]);

export function decodeFontFaces(bytes) {
  const fail = () => { throw new Error("InvalidFontFaces"); };
  if (!(bytes instanceof Uint8Array)) return fail();
  let rows;
  try { rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(); }
  if (!Array.isArray(rows) || rows.length > 1000000) return fail();
  let previousLanguage = -1, previousId = -1;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== 3 || !["language", "id", "name"].every(key => Object.hasOwn(row, key))) return fail();
    const language = FONT_LANGUAGES.indexOf(row.language);
    if (language < 0 || language < previousLanguage || !Number.isInteger(row.id) || row.id < 0 || row.id > 0xffffffff || language === previousLanguage && row.id <= previousId) return fail();
    if (row.name !== null && (typeof row.name !== "string" || !row.name.isWellFormed() || new TextEncoder().encode(row.name).length > 4096)) return fail();
    previousLanguage = language; previousId = row.id;
  }
  return rows;
}
