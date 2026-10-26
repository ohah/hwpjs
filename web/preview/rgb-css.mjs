/** Canonical 0xRRGGBB to CSS only; no source-format/channel interpretation. */
export function rgbCss(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffff
    ? `#${value.toString(16).padStart(6, "0")}`
    : null;
}
