export function isUtf16Boundary(text, unit) {
  if (typeof text !== "string" || !Number.isSafeInteger(unit) || unit < 0 || unit > text.length) return false;
  const previous = text.charCodeAt(unit - 1), current = text.charCodeAt(unit);
  return !(previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff);
}
