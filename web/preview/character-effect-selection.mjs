import { characterRangeValues } from "./character-range-values.mjs";
import { CHARACTER_EFFECTS as flags } from "../../js/character-effect-args.mjs";
export function characterEffectRangesState(content, ranges, flag) {
  if (!flags.includes(flag) || !Array.isArray(content?.characterEffects)) return null;
  const effects = new Map(content.characterEffects.map((row) => [row.id, row]));
  const values = characterRangeValues(content, ranges, (id) =>
    typeof effects.get(id)?.[flag] === "boolean" ? effects.get(id)[flag] : null,
  );
  return values === null
    ? null
    : values.every((value) => value === values[0])
      ? values[0]
      : "mixed";
}
