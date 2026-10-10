/** Preview drawing policy, not a claim of Hancom font shaping equivalence. */
import { canvasFontSize } from "./canvas-font-size.mjs";
export function characterScriptStyle(flags, font) {
  if (typeof flags?.superscript !== "boolean" || typeof flags?.subscript !== "boolean") return null;
  if (flags.superscript && flags.subscript) return { state: "conflict", font, offset: 0 };
  if (!flags.superscript && !flags.subscript) return { state: "none", font, offset: 0 };
  const size = canvasFontSize(font);
  if (!size) return null;
  const state = flags.superscript ? "superscript" : "subscript";
  return { state, font: font.replace(size.token, `${Number((size.value * 0.7).toPrecision(12))}${size.unit}`), offset: size.pixels * (flags.superscript ? -0.3 : 0.15) };
}
