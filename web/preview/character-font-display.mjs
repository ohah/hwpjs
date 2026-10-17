/** Display-only script choice; never rewrites document language references. */
import { FONT_LANGUAGES } from "../../js/font-faces.mjs";
export function displayFontLanguage(character) {
  if (/\p{Script=Hangul}/u.test(character)) return 0;
  if (/\p{Script=Latin}/u.test(character) || /^[0-9]$/u.test(character)) return 1;
  if (/\p{Script=Han}/u.test(character)) return 2;
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)) return 3;
  if (/\p{Symbol}/u.test(character)) return 5;
  return 4;
}

export function createCharacterFontDisplay(content) {
  const names = new Map((content.fontFaces ?? []).map(row => [`${row.language}:${row.id}`, row.name]));
  const references = new Map((content.characterFontReferences ?? []).map(row => [row.id, row.fontIds]));
  const metadata = new Map((content.fontFaceMetadata ?? []).map(row => [`${row.language}:${row.id}`, row]));
  return (id, text, unit) => {
    if (typeof text !== "string" || !Number.isInteger(unit) || unit < 0 || unit >= text.length) return null;
    const character = String.fromCodePoint(text.codePointAt(unit));
    const language = displayFontLanguage(character);
    const fontId = references.get(id)?.[language];
    if (fontId == null) return null;
    const name = names.get(`${FONT_LANGUAGES[language]}:${fontId}`);
    if (typeof name !== "string" || name.length === 0) return null;
    const resource = metadata.get(`${FONT_LANGUAGES[language]}:${fontId}`);
    const sub = resource?.substitute;
    const candidates = [name];
    // Only explicit TTF substitutes are CSS candidates. HFT/unknown kinds and
    // default names remain metadata; the browser still owns actual matching.
    const substitute = resource?.format === "hwpx"
      ? sub?.type === "TTF" && ["0", "false"].includes(sub.isEmbedded) ? sub.face : null
      : sub?.kind === 1 ? sub.name : null;
    if (typeof substitute === "string" && substitute.length && substitute !== name) candidates.push(substitute);
    return candidates.map(name => `"${name.replace(/["\\\x00-\x1f\x7f]/g, character => `\\${character.codePointAt(0).toString(16)} `)}"`).join(", ");
  };
}
