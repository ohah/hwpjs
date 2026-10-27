import type { CharacterFontLanguage } from '../commands/commands.ts';
// @ts-ignore Canonical language/ID ordering. No separate ordinal authority.
import { FONT_LANGUAGES, validFontFaceOrder } from '../../../../js/font-face-identity.mjs';
// @ts-ignore Canonical font-name byte/UTF-16 validator, including the 4096 byte bound.
import { characterFontNameArgs } from '../../../../js/character-font-name-args.mjs';
// @ts-ignore Shared character-span coverage; explicit scalar boundaries match public selections.
import { characterRangeValues } from '../../../../web/preview/character-range-values.mjs';
// @ts-ignore Canonical scalar boundary.
import { isUtf16Boundary } from '../../../../web/preview/utf16-boundary.mjs';

export type CharacterFontNameValue =
  | Readonly<{ kind: 'single'; name: string | null }>
  | Readonly<{ kind: 'mixed' }>
  | Readonly<{ kind: 'unknown' }>;
export interface CharacterFontNameObservation {
  readonly value: CharacterFontNameValue;
  readonly bindingValid: boolean;
}
export type CharacterFontNameObservations = Readonly<
  Record<CharacterFontLanguage, CharacterFontNameObservation>
>;
const uint = (x: unknown): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
const unknownValue: CharacterFontNameValue = Object.freeze({ kind: 'unknown' });
const unknownObservation = Object.freeze({ value: unknownValue, bindingValid: false });
const unknown = (): CharacterFontNameObservations =>
  Object.freeze(
    Object.fromEntries(FONT_LANGUAGES.map((language: string) => [language, unknownObservation])),
  ) as CharacterFontNameObservations;

/** Read-only source IDs/names. Language partitions remain Native-owned. One span lookup serves all languages. */
export function characterFontNameObservations(
  content: unknown,
  paragraph: unknown,
  start: number,
  end: number,
): CharacterFontNameObservations {
  const c = content as {
    characterFontNameAvailable?: unknown;
    fontFaces?: unknown;
    characterFontReferences?: unknown;
    fontFacesError?: unknown;
    characterFontReferencesError?: unknown;
  };
  const row = paragraph as { section?: unknown; paragraph?: unknown };
  if (
    c?.characterFontNameAvailable !== true ||
    c.fontFacesError ||
    c.characterFontReferencesError ||
    !Array.isArray(c.fontFaces) ||
    !Array.isArray(c.characterFontReferences) ||
    !uint(row?.section) ||
    !uint(row?.paragraph) ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start >= end
  )
    return unknown();
  const names = new Map<string, string | null>();
  try {
    if (!validFontFaceOrder(c.fontFaces)) return unknown();
    for (const face of c.fontFaces) {
      if (!face || typeof face !== 'object') return unknown();
      const f = face as { language: string; id: number; name: unknown };
      if (f.name !== null) {
        if (typeof f.name !== 'string') return unknown();
        // Empty source names can be observed; the writing validator still refuses them.
        if (f.name.length) characterFontNameArgs(f.language, f.name);
      }
      names.set(f.language + ':' + f.id, f.name as string | null);
    }
  } catch {
    return unknown();
  }
  const refs = new Map<number, readonly number[]>();
  for (const item of c.characterFontReferences) {
    if (!item || typeof item !== 'object') return unknown();
    const r = item as { id: unknown; fontIds: unknown };
    if (
      !uint(r.id) ||
      refs.has(r.id) ||
      !Array.isArray(r.fontIds) ||
      r.fontIds.length !== FONT_LANGUAGES.length ||
      !r.fontIds.every(uint)
    )
      return unknown();
    refs.set(r.id, r.fontIds);
  }
  const spans = characterRangeValues(
    content,
    [{ section: row.section, paragraph: row.paragraph, startUnit: start, endUnit: end }],
    (id: unknown) => (uint(id) ? (refs.get(id) ?? null) : null),
    { isBoundary: isUtf16Boundary },
  ) as readonly (readonly number[])[] | null;
  if (!spans) return unknown();
  return Object.freeze(
    Object.fromEntries(
      FONT_LANGUAGES.map((language: string, index: number) => {
        const keys = spans.map((ids) => language + ':' + ids[index]);
        if (keys.some((key) => !names.has(key))) return [language, unknownObservation];
        const values = keys.map((key) => names.get(key)!);
        const first = values[0];
        const value: CharacterFontNameValue = values.some((name) => name !== first)
          ? Object.freeze({ kind: 'mixed' })
          : Object.freeze({ kind: 'single', name: first });
        return [language, Object.freeze({ value, bindingValid: true })];
      }),
    ),
  ) as CharacterFontNameObservations;
}
