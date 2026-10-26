/** Sizes emitted by the preview font resolver, not a general CSS font parser. */
export function canvasFontSize(font) {
  if (typeof font !== "string") return null;
  const match = /\b(\d+(?:\.\d+)?)(px|pt)\b/.exec(font);
  if (!match) return null;
  const value = Number(match[1]),
    unit = match[2],
    pixels = value * (unit === "pt" ? 96 / 72 : 1);
  return value > 0 && Number.isFinite(pixels) ? { value, unit, pixels, token: match[0] } : null;
}
