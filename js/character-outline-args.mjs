export const HWP5_CHARACTER_OUTLINE_KINDS = Object.freeze(["none", "solid", "dot", "thick", "dash", "dash-dot", "dash-dot-dot"]);
export function hwp5CharacterOutlineArg(kind) {
  const value = HWP5_CHARACTER_OUTLINE_KINDS.indexOf(kind);
  if (value < 0) throw new TypeError("InvalidCharacterOutline");
  return value;
}
export function characterOutlineArg(kind) {
  const value = hwp5CharacterOutlineArg(kind);
  if (value > 1) throw new TypeError("InvalidCharacterOutline");
  return value;
}
