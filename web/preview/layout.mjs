// Test-only text flow, not HWP page layout. Never modify the source projection.
import { DEFAULT_ROW_HEIGHT, DEFAULT_TEXT_HEIGHT, TEXT_TOP } from "./row-geometry.mjs";
import { paragraphLineGeometry, paragraphSpacePixels, paragraphLineAdvance } from "./paragraph-geometry.mjs";
import { paragraphPictureFlow } from "./paragraph-picture-flow.mjs";
import { displayRunText, textMeasurement, measureDisplayRun } from "./text-measurement.mjs";
import { measureAutomaticNumberPrefix } from "./automatic-number-prefix.mjs";
import { isHardLineBreak } from "./hard-line-break.mjs";
import { alignTextRow } from "./line-alignment.mjs";
import { usesDocumentFontMetrics } from "./font-layout-policy.mjs";
export { displayRunText } from "./text-measurement.mjs";
export const FONT = "16px system-ui, sans-serif";
export const LINE_HEIGHT = DEFAULT_ROW_HEIGHT;
// Prototype tab display only; original HWP tab stops are not layouted yet.
export function layoutContent(content, width, measure, maxRows = 20000, { documentBody = false, noWrap = false, compactLines = false } = {}) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(maxRows) || maxRows < 1) throw new RangeError("InvalidLayoutBounds");
  const rows = [];
  const segments = new Intl.Segmenter("ko", { granularity: "grapheme" });
  let limited = content.limited, height = 0, spatialRows = false;
  const flowPictures = [...(content.placedPictures ?? [])];
  const push = row => {
    row = alignTextRow(row, { lastLine: row.lastLine === true });
    if (rows.length >= maxRows) {
      limited = true;
      if (row.kind !== "gap") for (const r of rows) if (r.section === row.section && r.paragraph === row.paragraph) { r.editable = false; r.selectable = false; }
      return false;
    }
    row.y = height;
    row.textHeight ??= DEFAULT_TEXT_HEIGHT;
    row.height ??= compactLines && row.kind === "text" ? row.textHeight : Math.max(LINE_HEIGHT, row.textHeight + TEXT_TOP);
    if (compactLines && row.kind === "text") row.textTop = 0;
    if (row.kind === "text") row.height = paragraphLineAdvance(row.paragraphShape, row.textHeight, row.height);
    if (!Number.isFinite(row.height) || !Number.isFinite(height + row.height)) throw new RangeError("InvalidLayoutBounds");
    height += row.height;
    rows.push(row); return true;
  };
  outer: for (const p of content.paragraphs) {
    const sourceStart = p.textStartUnit ?? 0;
    if (!Number.isSafeInteger(sourceStart) || sourceStart < 0 || sourceStart > Number.MAX_SAFE_INTEGER - p.text.length) throw new RangeError("InvalidLayoutBounds");
    let paragraphFlowed = false;
    // Grapheme wrapping is deliberately approximate. Kerning/complex shaping
    // and HWP-specific line-breaking rules are outside this prototype.
    for (const [value, kind] of [[p.label, "label"], [p.text, "text"]]) {
      if (documentBody && kind === "label") continue;
      if (kind === "text") {
        const flow = paragraphPictureFlow(content, p, width, height, (text, paragraph, unit, rowKind) => measure(displayRunText(text, paragraph, unit, rowKind), paragraph, unit, rowKind), maxRows - rows.length, flowPictures, content.pictureFlowContext);
        if (flow && flow.rows.length <= maxRows - rows.length) {
          for (const row of flow.rows) rows.push({ ...row, kind: "text", section: p.section, paragraph: p.paragraph, editable: p.editable, selectable: p.editable || p.selectable, paragraphShape: p.paragraphShape });
          height += flow.height; spatialRows = true; flowPictures.push(...flow.pictures);
          paragraphFlowed = true;
          continue;
        }
      }
      const before = kind === "text" ? paragraphSpacePixels(p.paragraphShape?.before) : 0;
      if (before > 0 && !push({ text: "", kind: "gap", height: before, section: p.section, paragraph: p.paragraph })) break outer;
      const firstUnit = kind === "text" ? sourceStart : 0;
      let numberPrefix = kind === "text" ? measureAutomaticNumberPrefix(p, firstUnit, measure) : null;
      // Document body height comes from each run, not the first run or a UI floor.
      // Empty/hard-break rows are measured explicitly below.
      const initialHeight = kind === "text" && documentBody && usesDocumentFontMetrics(content.format) ? 0
        : compactLines && kind === "text" ? textMeasurement(measure("", p, firstUnit, kind)).height : DEFAULT_TEXT_HEIGHT;
      let line = "", size = numberPrefix?.width ?? 0, textHeight = Math.max(initialHeight, numberPrefix?.height ?? 0), startUnit = firstUnit, boundaries = [{ unit: firstUnit, x: size }];
      const geometry = () => kind === "text" ? paragraphLineGeometry(p.paragraphShape, width, size, startUnit === 0) : { x: 0, width };
      const row = () => ({ text: line, kind, section: p.section, paragraph: p.paragraph, editable: kind === "text" && p.editable, selectable: kind === "text" && !p.clipped && (p.editable || p.selectable), startUnit, endUnit: startUnit + line.length, boundaries, textHeight, paragraphShape: p.paragraphShape, paragraphX: geometry().x, paragraphReferenceX: kind === "text" ? paragraphLineGeometry({ ...p.paragraphShape, alignment: 0 }, width, size, startUnit === 0).x : 0, width: geometry().width, ...(numberPrefix ? { numberPrefix } : {}) });
      for (const { segment } of segments.segment(value)) {
        if (kind === "text" && isHardLineBreak(segment)) {
          // Keep source units and selection boundaries, but no painted glyph.
          textHeight = Math.max(textHeight, textMeasurement(measure("", p, startUnit + line.length, kind)).height);
          line += segment;
          boundaries.push({ unit: startUnit + line.length, x: size });
          if (!push(row())) break outer;
          startUnit += line.length; line = ""; size = 0; textHeight = initialHeight;
          boundaries = [{ unit: startUnit, x: 0 }]; numberPrefix = null;
          continue;
        }
        const { width: advance, height: measuredHeight } = measureDisplayRun(segment, p, startUnit + line.length, kind, measure);
        if (!noWrap && line && size + advance > geometry().width) {
          if (!push(row())) break outer;
          startUnit += line.length; line = ""; size = 0; textHeight = initialHeight; boundaries = [{ unit: startUnit, x: 0 }];
          numberPrefix = null;
        }
        line += segment; size += advance; textHeight = Math.max(textHeight, measuredHeight);
        boundaries.push({ unit: startUnit + line.length, x: size });
      }
      if (kind === "text" && !line.length) textHeight = Math.max(textHeight, textMeasurement(measure("", p, startUnit, kind)).height);
      if (!push({ ...row(), lastLine: true })) break outer;
    }
    const after = paragraphFlowed ? 0 : paragraphSpacePixels(p.paragraphShape?.after);
    if (after > 0 && !push({ text: "", kind: "gap", height: after, section: p.section, paragraph: p.paragraph })) break;
    if (!documentBody && !push({ text: "", kind: "gap" })) break;
  }
  const terminal = rows.at(-1);
  if (compactLines && terminal?.kind === "text") {
    height -= terminal.height - terminal.textHeight; terminal.height = terminal.textHeight;
  }
  return { rows, limited, height, ...(spatialRows ? { spatialRows } : {}), ...(flowPictures.length ? { flowPictures } : {}) };
}
