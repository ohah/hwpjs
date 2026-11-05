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
    const value = data(input, ['kind', 'properties', 'language', 'name']);
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
  } catch {
    return null;
  }
  return null;
}
