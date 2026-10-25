// Logical grapheme flow consumed by page layout; not full Hancom text shaping.
import { DEFAULT_ROW_HEIGHT, DEFAULT_TEXT_HEIGHT, TEXT_TOP } from "./row-geometry.mjs";
import { paragraphLineGeometry, paragraphSpacePixels, paragraphLineAdvance } from "./paragraph-geometry.mjs";
import { paragraphPictureFlow } from "./paragraph-picture-flow.mjs";
import { displayRunText, textMeasurement, measureDisplayRun } from "./text-measurement.mjs";
import { measureAutomaticNumberPrefix } from "./automatic-number-prefix.mjs";
import { isHardLineBreak } from "./hard-line-break.mjs";
import { alignTextRow } from "./line-alignment.mjs";
import { usesDocumentFontMetrics } from "./font-layout-policy.mjs";
import { tabLineContext } from "./tab-line-context.mjs";
import { createTabRowState } from "./tab-row-state.mjs";
import { compactTerminalTextFlow } from "./terminal-text-flow.mjs";
import { createTextLineWidth } from "./text-line-width.mjs";
import { hwp5ParagraphBeforeGap } from "./hwp5-paragraph-before-gap.mjs";
import { inlineObjectLineAdvance } from "./inline-object-line-advance.mjs";
import { trailingSpaceStart, hangsTrailingSpace } from "./trailing-space-flow.mjs";
export { displayRunText } from "./text-measurement.mjs";
export const FONT = "16px system-ui, sans-serif";
export const LINE_HEIGHT = DEFAULT_ROW_HEIGHT;
// Current-source tabs and diagnosed prototype fallbacks share the same flow.
export function layoutContent(content, width, measure, maxRows = 20000, { documentBody = false, noWrap = false, compactLines = false, includeTerminalAfter = true } = {}) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(maxRows) || maxRows < 1) throw new RangeError("InvalidLayoutBounds");
  if (typeof includeTerminalAfter !== "boolean") throw new RangeError("InvalidLayoutBounds");
  const rows = [];
  const segments = new Intl.Segmenter("ko", { granularity: "grapheme" });
  let limited = content.limited, height = 0, spatialRows = false;
  const flowPictures = [...(content.placedPictures ?? [])];
  const push = (row, paragraph) => {
    row = alignTextRow(row, { lastLine: row.lastLine === true, paragraph });
    if (rows.length >= maxRows) {
      limited = true;
      if (row.kind !== "gap") for (const r of rows) if (r.section === row.section && r.paragraph === row.paragraph) { r.editable = false; r.selectable = false; }
      return false;
    }
    row.y = height;
    row.textHeight ??= DEFAULT_TEXT_HEIGHT;
    row.height ??= compactLines && row.kind === "text" ? row.textHeight : Math.max(LINE_HEIGHT, row.textHeight + TEXT_TOP);
    if (compactLines && row.kind === "text") row.textTop = 0;
    if (row.kind === "text") row.height = row.spacingBasisHeight === undefined
      ? paragraphLineAdvance(row.paragraphShape, row.textHeight, row.height)
      : inlineObjectLineAdvance(row.paragraphShape, row.textHeight, row.spacingBasisHeight, row.height);
    if (!Number.isFinite(row.height) || !Number.isFinite(height + row.height)) throw new RangeError("InvalidLayoutBounds");
    if (rows.length) rows[rows.length - 1] = hwp5ParagraphBeforeGap(rows.at(-1), row, paragraph);
    height += row.height;
    rows.push(row); return true;
  };
  outer: for (const p of content.paragraphs) {
    const sourceStart = p.textStartUnit ?? 0;
    const trailingStart = trailingSpaceStart(p.text, sourceStart);
    if (!Number.isSafeInteger(sourceStart) || sourceStart < 0 || sourceStart > Number.MAX_SAFE_INTEGER - p.text.length) throw new RangeError("InvalidLayoutBounds");
    let paragraphFlowed = false;
    // Grapheme wrapping is deliberately approximate. Kerning/complex shaping
    // and HWP-specific line-breaking rules are outside this prototype.
    for (const [value, kind] of [[p.memoLabel ?? p.label, "label"], [p.text, "text"]]) {
      if (documentBody && kind === "label") continue;
      if (kind === "text") {
        const flow = paragraphPictureFlow(content, p, width, height, (text, paragraph, unit, rowKind) => measureDisplayRun(text, paragraph, unit, rowKind, measure), maxRows - rows.length, flowPictures, content.pictureFlowContext,
          { includeTerminalAfter: includeTerminalAfter || p !== content.paragraphs.at(-1), compactTerminal: compactLines && p === content.paragraphs.at(-1) });
        if (flow && flow.rows.length <= maxRows - rows.length) {
          for (const row of flow.rows) rows.push({ ...row, kind: "text", section: p.section, paragraph: p.paragraph, editable: p.editable, selectable: p.editable || p.selectable, paragraphShape: p.paragraphShape });
          height += flow.height; spatialRows = true; flowPictures.push(...flow.pictures);
          paragraphFlowed = true;
          continue;
        }
      }
      const before = kind === "text" ? paragraphSpacePixels(p.paragraphShape?.before) : 0;
      if (before > 0 && !push({ text: "", kind: "gap", height: before, paragraphBefore: true, section: p.section, paragraph: p.paragraph })) break outer;
      const firstUnit = kind === "text" ? sourceStart : 0;
      let numberPrefix = kind === "text" ? measureAutomaticNumberPrefix(p, firstUnit, measure) : null;
      // Document body height comes from each run, not the first run or a UI floor.
      // Empty/hard-break rows are measured explicitly below.
      const documentMetrics = kind === "text" && documentBody && (usesDocumentFontMetrics(content.format)
        || usesDocumentFontMetrics(p.paragraphShape?.spacingFormat));
      const initialHeight = documentMetrics ? 0
        : compactLines && kind === "text" ? textMeasurement(measure("", p, firstUnit, kind)).height : DEFAULT_TEXT_HEIGHT;
      let line = "", textHeight = Math.max(initialHeight, numberPrefix?.height ?? 0), startUnit = firstUnit, boundaries = [{ unit: firstUnit, x: numberPrefix?.width ?? 0 }];
      let spacingBasisHeight = textHeight, hasInlineSpacing = false;
      let hasContent = Boolean(numberPrefix?.text?.trim());
      let lineWidth = createTextLineWidth(boundaries, numberPrefix?.width ?? 0);
      let tabs = createTabRowState();
      const geometry = () => kind === "text" ? paragraphLineGeometry(p.paragraphShape, width, lineWidth.width(), startUnit === 0) : { x: 0, width };
      const row = () => ({ text: line, kind, section: p.section, paragraph: p.paragraph, editable: kind === "text" && p.editable, selectable: kind === "text" && !p.clipped && (p.editable || p.selectable), startUnit, endUnit: startUnit + line.length, boundaries, textHeight, ...(hasInlineSpacing ? { spacingBasisHeight } : {}), ...(documentMetrics ? { textTop: 0 } : {}), paragraphShape: p.paragraphShape, paragraphX: geometry().x, paragraphReferenceX: kind === "text" ? paragraphLineGeometry({ ...p.paragraphShape, alignment: 0 }, width, lineWidth.width(), startUnit === 0).x : 0, width: geometry().width, ...(numberPrefix ? { numberPrefix } : {}), ...tabs.fields() });
      for (const { segment } of segments.segment(value)) {
        if (kind === "text" && isHardLineBreak(segment)) {
          // Keep source units and selection boundaries, but no painted glyph.
          const breakHeight = textMeasurement(measure("", p, startUnit + line.length, kind)).height;
          textHeight = Math.max(textHeight, breakHeight); spacingBasisHeight = Math.max(spacingBasisHeight, breakHeight);
          line += segment;
          lineWidth.hardBreak(startUnit + line.length);
          if (!push(row(), p)) break outer;
          startUnit += line.length; line = ""; textHeight = initialHeight; spacingBasisHeight = initialHeight; hasInlineSpacing = false; hasContent = false;
          boundaries = [{ unit: startUnit, x: 0 }]; numberPrefix = null;
          lineWidth = createTextLineWidth(boundaries);
          tabs = createTabRowState();
          continue;
        }
        let measured = measureDisplayRun(segment, p, startUnit + line.length, kind, measure,
          segment === "\t" ? tabLineContext(p, width, lineWidth.nextX(), startUnit, { naturalX: tabs.naturalX() }) : undefined);
        const hanging = kind === "text" && hangsTrailingSpace(segment, startUnit + line.length, trailingStart, hasContent);
        if (!noWrap && line && lineWidth.probe(measured) > geometry().width && !hanging) {
          if (!push(row(), p)) break outer;
          startUnit += line.length; line = ""; textHeight = initialHeight; spacingBasisHeight = initialHeight; hasInlineSpacing = false; hasContent = false; boundaries = [{ unit: startUnit, x: 0 }];
          lineWidth = createTextLineWidth(boundaries);
          numberPrefix = null;
          tabs = createTabRowState();
          if (segment === "\t") measured = measureDisplayRun(segment, p, startUnit, kind, measure, tabLineContext(p, width, lineWidth.nextX(), startUnit));
        }
        tabs.add(measured, startUnit + line.length, lineWidth.nextX());
        line += segment; textHeight = Math.max(textHeight, measured.height);
        spacingBasisHeight = Math.max(spacingBasisHeight, measured.spacingBasisHeight ?? measured.height);
        hasInlineSpacing ||= measured.spacingBasisHeight !== undefined;
        hasContent ||= segment.trim().length > 0;
        lineWidth.add(measured, startUnit + line.length);
      }
      if (kind === "text" && !line.length) textHeight = Math.max(textHeight, textMeasurement(measure("", p, startUnit, kind)).height);
      if (!push({ ...row(), lastLine: true }, p)) break outer;
    }
    const after = paragraphFlowed || !includeTerminalAfter && p === content.paragraphs.at(-1) ? 0 : paragraphSpacePixels(p.paragraphShape?.after);
    if (after > 0 && !push({ text: "", kind: "gap", height: after, section: p.section, paragraph: p.paragraph })) break;
    if (!documentBody && !push({ text: "", kind: "gap" })) break;
  }
  const flow = { rows, limited, height, ...(spatialRows ? { spatialRows } : {}), ...(flowPictures.length ? { flowPictures } : {}) };
  const pictureExtent = compactLines ? flowPictures.reduce((end, picture) => [0, 1].includes(picture.flow?.textWrap)
    ? Math.max(end, (picture.flowRectangle ?? picture.rectangle).y + (picture.flowRectangle ?? picture.rectangle).height) : end, 0) : 0;
  return compactLines ? compactTerminalTextFlow(flow, pictureExtent) : flow;
}
