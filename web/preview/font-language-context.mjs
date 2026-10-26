/** Script classification and bounded paragraph-local neutral inheritance. */
export function displayFontLanguage(character) {
  if (/\p{Script=Hangul}/u.test(character)) return 0;
  if (/\p{Script=Latin}/u.test(character) || /^[0-9]$/u.test(character)) return 1;
  if (/\p{Script=Han}/u.test(character)) return 2;
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)) return 3;
  if (/\p{Symbol}/u.test(character)) return 5;
  return 4;
}

const neutral = (character) => {
  const code = character.codePointAt(0);
  return (
    /\p{Mark}/u.test(character) ||
    code <= 0x20 ||
    (code >= 0x21 && code <= 0x2f) ||
    (code >= 0x3a && code <= 0x40) ||
    (code >= 0x5b && code <= 0x60) ||
    (code >= 0x7b && code <= 0x7f) ||
    (code >= 0xa0 && code <= 0xbf)
  );
};

export function createFontLanguageResolver() {
  let previousText,
    initial = 0,
    current = 0,
    next = 0,
    start = -1;
  return (text, unit) => {
    if (typeof text !== "string" || !Number.isInteger(unit) || unit < 0 || unit >= text.length)
      return null;
    if (text !== previousText) {
      previousText = text;
      initial = 0;
      for (const character of text)
        if (!neutral(character)) {
          initial = displayFontLanguage(character);
          break;
        }
      next = 0;
      start = -1;
      current = initial;
    }
    if (unit < start) {
      next = 0;
      start = -1;
      current = initial;
    }
    // Keep one paragraph cursor, not an array or every historical draft.
    while (next <= unit) {
      const character = String.fromCodePoint(text.codePointAt(next));
      if (!neutral(character)) current = displayFontLanguage(character);
      start = next;
      next += character.length;
    }
    return current;
  };
}
