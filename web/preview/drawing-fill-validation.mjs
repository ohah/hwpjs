import { DRAWING_PATTERN_KINDS } from "./drawing-pattern-fill.mjs";
const color = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
export function validDrawingFill(fill) {
  if (fill?.state === "solid") return color(fill.color);
  if (fill?.state === "pattern")
    return DRAWING_PATTERN_KINDS.includes(fill.kind) && color(fill.background) && color(fill.color);
  if (
    fill?.state !== "linear_gradient" ||
    !Number.isFinite(fill.angle) ||
    !Array.isArray(fill.stops) ||
    fill.stops.length < 2
  )
    return false;
  let previous = -Infinity;
  for (const stop of fill.stops) {
    if (
      !stop ||
      !Number.isFinite(stop.offset) ||
      stop.offset < 0 ||
      stop.offset > 1 ||
      stop.offset < previous ||
      !color(stop.color)
    )
      return false;
    previous = stop.offset;
  }
  return true;
}
