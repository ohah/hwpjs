// Test-only text flow, not HWP page layout. Never modify the source projection.
export const FONT = "16px system-ui, sans-serif";
export const LINE_HEIGHT = 28;
export function layoutContent(content, width, measure, maxRows = 20000) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(maxRows) || maxRows < 1) throw new RangeError("InvalidLayoutBounds");
  const rows = [];
  const segments = new Intl.Segmenter("ko", { granularity: "grapheme" });
  let limited = content.limited;
  const push = (text, kind) => { if (rows.length >= maxRows) { limited = true; return false; } rows.push({ text, kind }); return true; };
  outer: for (const p of content.paragraphs) {
    // Grapheme wrapping is deliberately approximate. Kerning/complex shaping
    // and HWP-specific line-breaking rules are outside this prototype.
    for (const [value, kind] of [[p.label, "label"], [p.text, "text"]]) {
      let line = "", size = 0;
      for (const { segment } of segments.segment(value)) {
        const advance = measure(segment);
        if (!Number.isFinite(advance) || advance < 0) throw new RangeError("InvalidTextMeasurement");
        if (line && size + advance > width) {
          if (!push(line, kind)) break outer;
          line = ""; size = 0;
        }
        line += segment; size += advance;
      }
      if (!push(line, kind)) break outer;
    }
    if (!push("", "gap")) break;
  }
  return { rows, limited };
}
