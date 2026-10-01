import { LINE_HEIGHT } from "./layout.mjs";
import { caretGeometry, hitText } from "./text-geometry.mjs";
import { graphemeUnits } from "./text-input.mjs";

/** Keyboard movement stays inside one displayed native paragraph. */
export function navigateText(layout, text, anchor, focus, key, { extend = false, paragraphEdge = false } = {}) {
  if (!focus || !anchor || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return null;
  let unit = focus.unit, affinity = "forward";
  if (key === "ArrowLeft" || key === "ArrowRight") {
    if (!extend && anchor.unit !== focus.unit) unit = key === "ArrowLeft" ? Math.min(anchor.unit, focus.unit) : Math.max(anchor.unit, focus.unit);
    else {
      const bounds = graphemeUnits(text);
      unit = key === "ArrowLeft" ? bounds.filter(b => b < unit).at(-1) ?? 0 : bounds.find(b => b > unit) ?? text.length;
    }
  } else {
    const caret = caretGeometry(layout, focus), row = caret && layout.rows[caret.row];
    if (!row) return null;
    if (key === "Home" || key === "End") {
      unit = paragraphEdge ? key === "Home" ? 0 : text.length : key === "Home" ? row.startUnit : row.endUnit;
      affinity = key === "End" ? "backward" : "forward";
    } else {
      const next = hitText(layout, caret.x, caret.y + (key === "ArrowUp" ? -LINE_HEIGHT : LINE_HEIGHT), focus);
      if (next) { unit = next.unit; affinity = next.affinity; }
    }
  }
  const next = { section: focus.section, paragraph: focus.paragraph, unit, affinity };
  return { anchor: extend ? anchor : next, focus: next };
}
