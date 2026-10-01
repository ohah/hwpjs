// Test-only text flow, not HWP page layout. Never modify the source projection.
export const FONT = "16px system-ui, sans-serif";
export const LINE_HEIGHT = 28;
export function layoutContent(content, width, measure, maxRows = 20000) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(maxRows) || maxRows < 1) throw new RangeError("InvalidLayoutBounds");
  const rows = [];
  const segments = new Intl.Segmenter("ko", { granularity: "grapheme" });
  let limited = content.limited;
  const push = row => {
    if (rows.length >= maxRows) {
      limited = true;
      if (row.kind !== "gap") for (const r of rows) if (r.section === row.section && r.paragraph === row.paragraph) r.editable = false;
      return false;
    }
    rows.push(row); return true;
  };
  outer: for (const p of content.paragraphs) {
    // Grapheme wrapping is deliberately approximate. Kerning/complex shaping
    // and HWP-specific line-breaking rules are outside this prototype.
    for (const [value, kind] of [[p.label, "label"], [p.text, "text"]]) {
      let line = "", size = 0, startUnit = 0, boundaries = [{ unit: 0, x: 0 }];
      const row = () => ({ text: line, kind, section: p.section, paragraph: p.paragraph, editable: kind === "text" && p.editable, startUnit, endUnit: startUnit + line.length, boundaries });
      for (const { segment } of segments.segment(value)) {
        const advance = measure(segment);
        if (!Number.isFinite(advance) || advance < 0) throw new RangeError("InvalidTextMeasurement");
        if (line && size + advance > width) {
          if (!push(row())) break outer;
          startUnit += line.length; line = ""; size = 0; boundaries = [{ unit: startUnit, x: 0 }];
        }
        line += segment; size += advance;
        boundaries.push({ unit: startUnit + line.length, x: size });
      }
      if (!push(row())) break outer;
    }
    if (!push({ text: "", kind: "gap" })) break;
  }
  return { rows, limited };
}
