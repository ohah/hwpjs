import { characterRangeValues } from './character-range-values.mjs';
import { CHARACTER_EFFECTS as flags } from '../../js/character-effect-args.mjs';
export function characterEffectResourceValue(row, flag) {
  return flags.includes(flag) && typeof row?.[flag] === 'boolean' ? row[flag] : null;
}
export function characterEffectRangesState(content, ranges, flag) {
  if (!flags.includes(flag) || !Array.isArray(content?.characterEffects)) return null;
  const effects = new Map(content.characterEffects.map((row) => [row.id, row]));
  const values = characterRangeValues(content, ranges, (id) =>
    characterEffectResourceValue(effects.get(id), flag),
  );
  return values === null
    ? null
    : values.every((value) => value === values[0])
      ? values[0]
      : 'mixed';
}
