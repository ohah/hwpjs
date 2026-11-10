import { paragraphSelectionOwner } from './paragraph-selection.mjs';
import { characterColorArg } from '../../js/character-color-args.mjs';
import { FONT_LANGUAGES } from '../../js/font-faces.mjs';
import { characterPropertyArgs } from '../../js/character-property-args.mjs';
import { characterFontNameArgs } from '../../js/character-font-name-args.mjs';

// 소유 data 속성만 한 번 읽는다. Proxy trap 뒤에는 호출자가 현재성을 다시 검사한다.
export function ownCaretTypingIntent(input) {
  const data = (value, allowed) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (
        typeof key !== 'string' ||
        !allowed.includes(key) ||
        !Object.hasOwn(descriptors[key], 'value')
      )
        return null;
      result[key] = descriptors[key].value;
    }
    return result;
  };
  try {
    const value = data(input, [
      'kind',
      'properties',
      'language',
      'name',
      'names',
      'fontId',
      'underlineKind',
      'enabled',
      'color',
    ]);
    if (!value) return null;
    if (value.kind === 'character-properties') {
      if (Reflect.ownKeys(value).some((key) => !['kind', 'properties'].includes(key))) return null;
      const properties = data(value.properties, ['size', 'bold', 'italic']);
      if (!properties) return null;
      characterPropertyArgs(properties);
      return Object.freeze({ kind: value.kind, properties: Object.freeze(properties) });
    }
    if (value.kind === 'font-name') {
      if (Reflect.ownKeys(value).some((key) => !['kind', 'language', 'name'].includes(key)))
        return null;
      characterFontNameArgs(value.language, value.name);
      return Object.freeze({ kind: value.kind, language: value.language, name: value.name });
    }
    const only = (...keys) =>
      Reflect.ownKeys(value).every((key) => key === 'kind' || keys.includes(key));
    if (value.kind === 'font-names' && only('names')) {
      const names = data(value.names, FONT_LANGUAGES);
      if (!names || Object.keys(names).length !== FONT_LANGUAGES.length) return null;
      for (const language of FONT_LANGUAGES) characterFontNameArgs(language, names[language]);
      return Object.freeze({ kind: value.kind, names: Object.freeze(names) });
    }
    if (
      value.kind === 'font-id' &&
      only('language', 'fontId') &&
      FONT_LANGUAGES.includes(value.language) &&
      Number.isInteger(value.fontId) &&
      value.fontId >= 0 &&
      value.fontId <= 0xffffffff
    )
      return Object.freeze({ kind: value.kind, language: value.language, fontId: value.fontId });
    if (
      value.kind === 'underline' &&
      only('underlineKind') &&
      ['none', 'bottom', 'top'].includes(value.underlineKind)
    )
      return Object.freeze({ kind: value.kind, underlineKind: value.underlineKind });
    if (value.kind === 'strike' && only('enabled') && typeof value.enabled === 'boolean')
      return Object.freeze({ kind: value.kind, enabled: value.enabled });
    if (['text-color', 'underline-color', 'strike-color'].includes(value.kind) && only('color'))
      return Object.freeze({ kind: value.kind, color: characterColorArg(value.color) });
  } catch {
    return null;
  }
  return null;
}

export function caretRichCharacter(intent) {
  switch (intent.kind) {
    case 'character-properties':
      return Object.fromEntries(
        Object.entries(intent.properties).filter(([, value]) => value !== null),
      );
    case 'font-name':
      return { fonts: { [intent.language]: { name: intent.name } } };
    case 'font-id':
      return { fonts: { [intent.language]: { id: intent.fontId } } };
    case 'font-names':
      return {
        fonts: Object.fromEntries(
          FONT_LANGUAGES.map((language) => [language, { name: intent.names[language] }]),
        ),
      };
    case 'underline':
      return { underline: { kind: intent.underlineKind } };
    case 'strike':
      return { strike: { enabled: intent.enabled } };
    case 'text-color':
      return { textColor: intent.color };
    case 'underline-color':
      return { underline: { color: intent.color } };
    case 'strike-color':
      return { strike: { color: intent.color } };
  }
}

export function mergeCaretRichCharacter(previous, patch) {
  const character = { ...previous, ...patch };
  for (const key of ['underline', 'strike', 'fonts']) {
    if (patch[key]) character[key] = { ...previous[key], ...patch[key] };
  }
  return character;
}

export function richTypingOwnerAllowed(format, row) {
  if (
    !row?.editable ||
    row.clipped ||
    row.createdCell ||
    paragraphSelectionOwner(row) !== `section:${row.section}:body`
  )
    return false;
  return format === 'hwp5'
    ? ['original', 'generated'].includes(row.currentReference?.kind)
    : format === 'hwpx' && row.plainEditable === true;
}
