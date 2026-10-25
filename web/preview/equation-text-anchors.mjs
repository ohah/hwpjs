import { equationPaintAt } from "./equation-render-content.mjs";
import { textMeasurement } from "./text-measurement.mjs";

function emptyNativeLayout(paint) {
  return paint.layout.box.width === 0
    && Array.isArray(paint.plan.requests) && paint.plan.requests.length === 0
    && ["glyphs", "rules", "paths", "rectangles", "curves"].every(key => Array.isArray(paint.layout[key]) && paint.layout[key].length === 0);
}

export function equationTextMeasure(measure) {
  return (text, paragraph, unit, kind) => {
    const measured = textMeasurement(measure(text, paragraph, unit, kind));
    const paint = kind === "text" && text !== "" ? equationPaintAt(paragraph, unit) : null;
    return paint ? { ...measured, width: paint.layout.box.width, height: Math.max(measured.height, paint.layout.box.ascent + paint.layout.box.descent) } : measured;
  };
}

// A source marker becomes a measured text atom only with its own ready native layout.
export function equationTextAnchors(paragraph) {
  const fail = source => ({ state: "unavailable", error: "UnavailableEquationTextAnchor",
    ...(Number.isSafeInteger(source?.node) && source.node >= 0 ? { equationNode: source.node } : {}) });
  if (paragraph?.equations === undefined) return { state: "resolved", anchors: [] };
  if (!Array.isArray(paragraph.equations) || !Array.isArray(paragraph.equationPaint ?? [])) return fail();
  if (paragraph.automaticNumbers !== undefined && !Array.isArray(paragraph.automaticNumbers)) return fail();
  if (paragraph.equationPaint?.some(row => !row || typeof row !== "object")) return fail();
  const anchors = [], nodes = new Set(), units = new Set();
  for (const source of paragraph.equations) {
    if (!source || !Number.isSafeInteger(source.node) || source.node < 0 || !Number.isSafeInteger(source.unit) || source.unit < 0
      || nodes.has(source.node) || units.has(source.unit) || paragraph.text?.[source.unit] !== "\ufffc") return fail(source);
    if (paragraph.automaticNumbers?.some(number => number?.unit === source.unit)) return fail(source);
    const paint = equationPaintAt(paragraph, source.unit), box = paint?.layout?.box;
    if (paint?.node !== source.node || paint.plan?.ready !== true || !box
      || ![box.width, box.ascent, box.descent].every(n => Number.isFinite(n) && n >= 0)
      || !Number.isFinite(box.ascent + box.descent)
      || (box.ascent + box.descent === 0 && !emptyNativeLayout(paint))) return fail(source);
    nodes.add(source.node); units.add(source.unit);
    anchors.push({ section: paragraph.section, paragraph: paragraph.paragraph, node: source.node, anchorUnit: source.unit });
  }
  return { state: "resolved", anchors };
}
