/** Display-only script choice; never rewrites document language references. */
import { FONT_LANGUAGES } from '../../js/font-faces.mjs';
import { createFontLanguageResolver } from './font-language-context.mjs';
export { displayFontLanguage } from './font-language-context.mjs';
export function quoteCssFontFamily(name) {
  // oxlint-disable-next-line no-control-regex -- CSS 글꼴 이름 안의 제어문자를 코드포인트 escape로 바꾸는 출력 보호다.
  return `"${name.replace(/["\\\x00-\x1f\x7f]/g, (character) => `\\${character.codePointAt(0).toString(16)} `)}"`;
}

export function createCharacterFontSource(content) {
  const languageAt = createFontLanguageResolver();
  const names = new Map(
    (content.fontFaces ?? []).map((row) => [`${row.language}:${row.id}`, row.name]),
  );
  const references = new Map(
    (content.characterFontReferences ?? []).map((row) => [row.id, row.fontIds]),
  );
  const metadata = new Map(
    (content.fontFaceMetadata ?? []).map((row) => [`${row.language}:${row.id}`, row]),
  );
  return (id, text, unit) => {
    if (typeof text !== 'string' || !Number.isInteger(unit) || unit < 0 || unit >= text.length)
      return null;
    const language = languageAt(text, unit);
    const fontId = references.get(id)?.[language];
    if (fontId == null) return null;
    const name = names.get(`${FONT_LANGUAGES[language]}:${fontId}`);
    if (typeof name !== 'string' || name.length === 0) return null;
    const resource = metadata.get(`${FONT_LANGUAGES[language]}:${fontId}`);
    return { name, id: fontId, language: FONT_LANGUAGES[language], metadata: resource };
  };
}

export function createCharacterFontDisplay(content) {
  const sourceAt = createCharacterFontSource(content);
  return (id, text, unit) => {
    const source = sourceAt(id, text, unit);
    if (!source) return null;
    const { name, metadata: resource } = source,
      sub = resource?.substitute;
    const candidates = [name];
    // Only explicit TTF substitutes are CSS candidates. HFT/unknown kinds and
    // default names remain metadata; the browser still owns actual matching.
    const substitute =
      resource?.format === 'hwpx'
        ? sub?.type === 'TTF' && ['0', 'false'].includes(sub.isEmbedded)
          ? sub.face
          : null
        : sub?.kind === 1
          ? sub.name
          : null;
    if (typeof substitute === 'string' && substitute.length && substitute !== name)
      candidates.push(substitute);
    return candidates.map(quoteCssFontFamily).join(', ');
  };
}
