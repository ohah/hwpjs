import { projectGroupedCurve } from "./grouped-curve-page-projection.mjs";
import { curveTextFrame } from "./curve-text-frame.mjs";
import { drawingColumnContext } from "./drawing-column-context.mjs";
import { layoutDrawingText } from "./drawing-text-layout.mjs";

// Candidate frame adapter; preserves curve identity and never manufactures rectangle corners.
export function layoutGroupedCurveText(item, content, rows, measure, options = {}) {
  const projected = projectGroupedCurve(item, content?.containers, content?.paragraphs, rows);
  if (projected.state !== "placed") return projected;
  const frame = curveTextFrame(item.source, projected);
  if (frame.state !== "selected") return frame;
  const drawing = { section: item.section, drawingNode: item.curveNode, source: { text: item.source.text } };
  const columns = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
  if (columns.state !== "selected") return columns;
  const members = content.paragraphs.filter(p => p.section === item.section && p.drawingText?.drawingNode === item.curveNode);
  const layout = layoutDrawingText(drawing, members, columns.declaration, frame.rectangle, measure,
    { overflow: "extend-last-column", ...options, compactLines: true });
  if (layout.state !== "placed") return { ...layout, frameBasis: frame.basis, curveNode: item.curveNode };
  return { ...layout, curveNode: item.curveNode, frameBasis: frame.basis, frameVerified: false,
    warnings: [{ code: "UnverifiedCurveTextFrame", section: item.section, curveNode: item.curveNode },
      ...(layout.overflowed ? [{ code: "CurveTextFrameOverflow", section: item.section, curveNode: item.curveNode }] : [])],
    rectangle: frame.rectangle, projected,
    rows: layout.rows.map(row => ({ ...row, pageOrdinal: projected.pageOrdinal, referenceBoxes: projected.referenceBoxes })) };
}
