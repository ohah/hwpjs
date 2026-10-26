export const CHARACTER_EFFECTS = Object.freeze(['emboss', 'engrave', 'superscript', 'subscript']);
export function characterEffectMode(exclusive) {
  if (typeof exclusive !== 'boolean') throw new TypeError('InvalidCharacterEffectMode');
  return exclusive;
}
export function characterEffectArgs(effect, enabled) {
  const kind = CHARACTER_EFFECTS.indexOf(effect);
  if (kind < 0 || typeof enabled !== 'boolean') throw new TypeError('InvalidCharacterEffect');
  return [kind, Number(enabled)];
}
