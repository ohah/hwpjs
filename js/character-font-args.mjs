import { FONT_LANGUAGES } from "./font-faces.mjs";

export function characterFontArgs(language, fontId) {
  const index = FONT_LANGUAGES.indexOf(language);
  if (index < 0) throw new RangeError("InvalidCharacterFontLanguage");
  if (!Number.isInteger(fontId) || fontId < 0 || fontId > 0xffffffff)
    throw new RangeError("InvalidFontId");
  return [index, fontId];
}
