// @ts-ignore Canonical UTF-16 scalar boundary, equivalent to public selection admission.
import { isUtf16Boundary } from '../../../../web/preview/utf16-boundary.mjs';
// @ts-ignore Shared display coverage; no second range model.
import { characterRangeValues } from '../../../../web/preview/character-range-values.mjs';
export interface CharacterTextColorObservation {
  readonly value: string | 'mixed' | null;
  readonly bindingValid: boolean;
}
const unavailable = (): CharacterTextColorObservation =>
  Object.freeze({ value: null, bindingValid: false });
/** Binding-level permission only. Editor token/owner/readonly and Native gates remain authoritative. */
export function characterTextColorObservation(
  content: unknown,
  paragraph: unknown,
  start: number,
  end: number,
): CharacterTextColorObservation {
  const c = content as { characterTextColorAvailable?: boolean; characterTextColors?: unknown };
  const p = paragraph as { section?: number; paragraph?: number };
  const uint = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (
    c?.characterTextColorAvailable !== true ||
    !Array.isArray(c.characterTextColors) ||
    !uint(p?.section) ||
    !uint(p?.paragraph) ||
    start >= end
  )
    return unavailable();
  const paragraphs = (content as { paragraphs?: unknown }).paragraphs;
  if (!Array.isArray(paragraphs) || paragraphs.some((row) => !row || typeof row !== 'object'))
    return unavailable();
  const colors = new Map<number, { color: number | null }>();
  for (const item of c.characterTextColors) {
    if (!item || typeof item !== 'object') return unavailable();
    const row = item as { id?: unknown; color?: unknown };
    if (!uint(row.id) || colors.has(row.id)) return unavailable();
    if (row.color !== null && (!uint(row.color) || row.color > 0xffffff)) return unavailable();
    colors.set(row.id, { color: row.color as number | null });
  }
  // A valid row with color:null is distinct from an absent or malformed resource binding.
  const values = characterRangeValues(
    content,
    [{ section: p.section, paragraph: p.paragraph, startUnit: start, endUnit: end }],
    (id: unknown) => (uint(id) ? (colors.get(id) ?? null) : null),
    { isBoundary: isUtf16Boundary },
  ) as { color: number | null }[] | null;
  if (!values) return unavailable();
  const color = values[0].color;
  if (color === null || values.some((row) => row.color === null))
    return Object.freeze({ value: null, bindingValid: true });
  return Object.freeze({
    value: values.some((row) => row.color !== color)
      ? 'mixed'
      : `#${color.toString(16).padStart(6, '0')}`,
    bindingValid: true,
  });
}
/** Unknown remains null; no automatic color or named-color interpretation is manufactured. */
export function characterTextColorState(
  content: unknown,
  paragraph: unknown,
  start: number,
  end: number,
): string | 'mixed' | null {
  return characterTextColorObservation(content, paragraph, start, end).value;
}
