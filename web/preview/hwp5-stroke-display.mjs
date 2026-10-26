import { colorrefCss } from './colorref-css.mjs';

// HWP5 LineType is not the common display enum: raw2=Dash, raw3=Dot.
// Raw source values stay in the native style snapshot, never patched here.
export function hwp5StrokeDisplay(border) {
  const raw = border?.attributes?.raw,
    width = border?.width,
    color = border?.color;
  if (
    !Number.isInteger(raw) ||
    raw < 0 ||
    raw > 0xffffffff ||
    !Number.isInteger(width) ||
    width < -0x80000000 ||
    width > 0x7fffffff ||
    !Number.isInteger(color) ||
    color < 0 ||
    color > 0xffffffff
  )
    return null;
  const kind = raw & 63,
    css = colorrefCss(color);
  if (kind > 5 || (kind !== 0 && (width <= 0 || css === null))) return null;
  return {
    color: css === null ? color : Number.parseInt(css.slice(1), 16),
    width,
    style: kind === 2 ? 3 : kind === 3 ? 2 : kind,
  };
}
