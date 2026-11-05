// 캡처 한 번의 정규화 모델 관측이다. 호출 간 캐시나 Native 대상 발급은 없다.
import { FONT_LANGUAGES, validFontFaceOrder } from '../../js/font-face-identity.mjs';
import { characterFontNameArgs } from '../../js/character-font-name-args.mjs';
import { CHARACTER_EFFECTS } from '../../js/character-effect-args.mjs';
import { characterRangeValues } from './character-range-values.mjs';
import { observationRows, uint } from './observation-structure.mjs';
import { isUtf16Boundary } from './utf16-boundary.mjs';
import { paragraphAlignmentKey } from './paragraph-alignments.mjs';
import { characterPropertyResourceValue } from './character-property-selection.mjs';
import { isSourceCharacterSize } from './character-size-selection.mjs';
import { characterShadeResourceValue } from './character-shade-selection.mjs';
import { characterOutlineResourceKind } from './character-outline-selection.mjs';
import { characterEffectResourceValue } from './character-effect-selection.mjs';
const merge = (previous, value) => {
  if (previous === null || value === null || value === undefined) return null;
  return previous === undefined || previous === value ? value : 'mixed';
};
export function rangeFormattingObservation(content, ranges) {
  const paragraphs = new Map();
  for (const row of content?.paragraphs ?? []) {
    if (!row) continue;
    const sectionKey = row.section,
      paragraphKey = row.paragraph;
    if (!uint(sectionKey) || !uint(paragraphKey)) continue;
    let section = paragraphs.get(sectionKey);
    if (!section) paragraphs.set(sectionKey, (section = new Map()));
    // 기존 find의 첫 일치 의미를 유지한다. 외부 기본 helper는 바꾸지 않는다.
    if (!section.has(paragraphKey)) section.set(paragraphKey, row);
  }
  const at = (section, paragraph) => paragraphs.get(section)?.get(paragraph);
  const ids = characterRangeValues(
    content,
    ranges,
    (id) => id,
    { isBoundary: isUtf16Boundary },
    at,
  );
  const resources = Object.fromEntries(
    [
      ['shapes', 'characterShapes'],
      ['underlines', 'characterUnderlines'],
      ['strikes', 'characterStrikes'],
      ['colors', 'characterTextColors'],
      ['fonts', 'characterFontReferences'],
      ['shades', 'characterShades'],
      ['outlines', 'characterOutlines'],
      ['effects', 'characterEffects'],
    ].map(([key, field]) => [key, observationRows(content?.[field])]),
  );
  const names = new Map();
  let fontsValid =
    content?.characterFontNameAvailable === true &&
    !content.fontFacesError &&
    !content.characterFontReferencesError &&
    Array.isArray(content.fontFaces) &&
    validFontFaceOrder(content.fontFaces);
  if (fontsValid) {
    try {
      for (const face of content.fontFaces) {
        if (face.name !== null) {
          if (typeof face.name !== 'string') throw Error('InvalidFontName');
          if (face.name.length) characterFontNameArgs(face.language, face.name);
        }
        names.set(face.language + ':' + face.id, face.name);
      }
    } catch {
      fontsValid = false;
    }
  }
  const refs = resources.fonts;
  if (
    !refs ||
    [...refs.values()].some(
      (row) =>
        !Array.isArray(row.fontIds) ||
        row.fontIds.length !== FONT_LANGUAGES.length ||
        !row.fontIds.every(uint),
    )
  )
    fontsValid = false;
  const colorsValid =
    content?.characterTextColorAvailable === true &&
    resources.colors &&
    [...resources.colors.values()].every(
      (row) => row.color === null || (uint(row.color) && row.color <= 0xffffff),
    );
  const values = {};
  const effects = {};
  const fontValues = {};
  const fontBindings = Object.fromEntries(
    FONT_LANGUAGES.map((language) => [language, Boolean(ids && fontsValid)]),
  );
  const selectedFontIds = Object.fromEntries(
    FONT_LANGUAGES.map((language) => [language, new Set()]),
  );
  let colorBindingValid = Boolean(ids && colorsValid);
  // span과 source/resource 조회를 필드마다 반복하지 않는다. 같은 원본 shape는 한 번만 읽는다.
  for (const id of ids ? new Set(ids) : []) {
    const shape = resources.shapes?.get(id);
    const underline = resources.underlines?.get(id);
    const strike = resources.strikes?.get(id);
    for (const property of ['bold', 'italic', 'underline', 'strike']) {
      const available =
        property === 'underline'
          ? content.characterUnderlineAvailable
          : property === 'strike'
            ? content.characterStrikeAvailable
            : content.characterPropertiesAvailable;
      const value =
        available === true
          ? characterPropertyResourceValue(property, shape, underline, strike)
          : null;
      values[property] = merge(values[property], typeof value === 'boolean' ? value : null);
    }
    const height = shape?.height;
    values.size = merge(
      values.size,
      content.characterPropertiesAvailable === true && isSourceCharacterSize(height)
        ? height
        : null,
    );
    const color = colorsValid ? resources.colors.get(id) : null;
    colorBindingValid &&= Boolean(color);
    values.textColor = merge(
      values.textColor,
      color && color.color !== null ? '#' + color.color.toString(16).padStart(6, '0') : null,
    );
    values.shade = merge(values.shade, characterShadeResourceValue(resources.shades?.get(id)));
    values.outline = merge(
      values.outline,
      characterOutlineResourceKind(resources.outlines?.get(id)),
    );
    for (const effect of CHARACTER_EFFECTS)
      effects[effect] = merge(
        effects[effect],
        characterEffectResourceValue(resources.effects?.get(id), effect),
      );
    for (let index = 0; index < FONT_LANGUAGES.length; index++) {
      const language = FONT_LANGUAGES[index];
      const fontId = fontsValid ? refs.get(id)?.fontIds[index] : undefined;
      const key = language + ':' + fontId;
      if (!uint(fontId) || !names.has(key)) {
        fontBindings[language] = false;
        continue;
      }
      selectedFontIds[language].add(fontId);
      const value = names.get(key);
      const previous = fontValues[language];
      if (previous === undefined) fontValues[language] = { kind: 'single', name: value };
      else if (previous.kind === 'single' && previous.name !== value)
        fontValues[language] = { kind: 'mixed' };
    }
  }
  const orderedFontIds = Object.fromEntries(FONT_LANGUAGES.map((language) => [language, []]));
  // 정규 언어별 원본 목록의 순서를 재사용해 ID 정렬 비용을 새로 만들지 않는다.
  if (fontsValid)
    for (const face of content.fontFaces)
      if (selectedFontIds[face.language].has(face.id)) orderedFontIds[face.language].push(face.id);
  let align;
  for (const range of ranges ?? []) {
    const row = at(range.section, range.paragraph);
    align = merge(align, paragraphAlignmentKey(row?.paragraphShape?.alignment));
  }
  return Object.freeze({
    ...Object.fromEntries(
      ['size', 'bold', 'italic', 'underline', 'strike', 'textColor', 'shade', 'outline'].map(
        (key) => [key, values[key] ?? null],
      ),
    ),
    effects: Object.freeze(
      Object.fromEntries(CHARACTER_EFFECTS.map((effect) => [effect, effects[effect] ?? null])),
    ),
    fontNames: Object.freeze(
      Object.fromEntries(
        FONT_LANGUAGES.map((language) => [
          language,
          Object.freeze(fontBindings[language] ? fontValues[language] : { kind: 'unknown' }),
        ]),
      ),
    ),
    fontIds: Object.freeze(
      Object.fromEntries(
        FONT_LANGUAGES.map((language) => [
          language,
          fontBindings[language] ? Object.freeze(orderedFontIds[language]) : null,
        ]),
      ),
    ),
    align: align ?? null,
    colorBindingValid,
    fontBindings: Object.freeze(fontBindings),
  });
}
