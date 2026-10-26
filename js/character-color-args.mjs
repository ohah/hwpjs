export function characterColorArg(color) {
  const value = parseCharacterColor(color);
  if (value === null) throw new TypeError("InvalidCharacterColor");
  return value;
}
export function parseCharacterColor(color) {
  return typeof color === "string" && color.length === 7 && /^#[0-9a-f]{6}$/i.test(color)
    ? Number.parseInt(color.slice(1), 16)
    : null;
}
