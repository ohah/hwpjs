import { validateHwp5DrawingStyleSources } from "../../js/hwp5-drawing-style-sources.mjs";
import { gradientStepStops } from "./gradient-step-stops.mjs";
import { hwp5DrawingPaintTail } from "./hwp5-drawing-paint-tail.mjs";
import { colorrefCss } from "./colorref-css.mjs";
import { hwp5StrokeDisplay } from "./hwp5-stroke-display.mjs";
const hatches = ["HORIZONTAL", "VERTICAL", "BACK_SLASH", "SLASH", "CROSS", "CROSS_DIAGONAL"];
export function hwp5DrawingPaintPlan(style) {
  const fail = error => ({ state: "unavailable", error });
  try { validateHwp5DrawingStyleSources([style]); } catch (error) { return fail(error.message); }
  const tail = hwp5DrawingPaintTail(style);
  if (tail.state !== "selected") return tail;
  const color = colorrefCss;
  const line = style.border.attributes.raw & 63;
  const cap = style.border.attributes.raw >>> 6 & 15;
  const stroke = hwp5StrokeDisplay(style.border);
  if (!stroke || (line === 0 ? cap > 1 : cap !== 1) || (style.border.attributes.raw >>> 10 & 63) !== 0
    || (style.border.attributes.raw >>> 16 & 63) !== 0 || style.border.outline !== 0) return fail("UnsupportedHwp5DrawingStroke");
  let fill;
  if (style.fill_flags === 0 && style.additional_bytes === 0) fill = { state: "none" };
  else if (style.fill_flags === 1 && style.additional_bytes === 0 && style.alpha.pattern === 0) {
    const pattern = style.pattern, background = color(pattern.background), foreground = color(pattern.foreground);
    if (!background || !foreground) return fail("UnsupportedHwp5DrawingFillColor");
    if (pattern.kind === -1) fill = { state: "solid", color: background };
    else if (hatches[pattern.kind]) fill = { state: "pattern", background, color: foreground, kind: hatches[pattern.kind], rasterParity: "unverified" };
    else return fail("UnsupportedHwp5DrawingHatch");
  } else if (style.fill_flags === 4 && style.additional_bytes === 1 && style.alpha.gradient === 0) {
    const g = style.gradient;
    if (!g || g.kind !== 1 || g.positions.length !== 0 || g.blur_center === null) return fail("UnsupportedHwp5DrawingGradient");
    try {
      const stops = gradientStepStops(g.colors.map(color), g.blur, g.blur_center);
      fill = stops.length ? { state: "linear_gradient", angle: g.angle, stops, rasterParity: "unverified" } : { state: "none" };
    } catch (error) { return fail(error.message); }
  } else return fail("UnsupportedHwp5DrawingFill");
  return { state: "planned", stroke, fill, shadowType: tail.shadowType, tailPolicy: tail.policy };
}
