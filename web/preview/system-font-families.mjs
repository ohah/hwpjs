import { characterFontNameArgs } from '../../js/character-font-name-args.mjs';

/** FontData.family metadata only; never reads font bytes or invents installed names. */
export function systemFontFamilies(fonts) {
  if (!Array.isArray(fonts) || fonts.length > 100000) throw new Error('InvalidSystemFonts');
  const names = new Set();
  for (const font of fonts) {
    const name = font?.family;
    try {
      characterFontNameArgs('hangul', name);
    } catch {
      throw new Error('InvalidSystemFontName');
    }
    names.add(name);
    if (names.size > 10000) throw new Error('SystemFontLimitExceeded');
  }
  return [...names].sort();
}
