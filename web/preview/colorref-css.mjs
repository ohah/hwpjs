/** Raw HWP COLORREF is BGR-packed, unlike the common display RGB integer. */
export function colorrefCss(raw) {
  return Number.isInteger(raw) && raw >= 0 && raw <= 0xffffff
    ? `#${[raw & 255, (raw >>> 8) & 255, (raw >>> 16) & 255].map((value) => value.toString(16).padStart(2, "0")).join("")}`
    : null;
}
