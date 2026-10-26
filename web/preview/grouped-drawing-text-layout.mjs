import { projectGroupedShape } from './grouped-shape-page-projection.mjs';
import { layoutDrawingText } from './drawing-text-layout.mjs';

/** Axis-aligned text uses the final group rectangle, not another scale transform. */
export function layoutGroupedDrawingText(
  drawing,
  root,
  paragraphs,
  declaration,
  pageRows,
  measure,
  options,
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (drawing?.source?.caption != null) return unavailable('UnsupportedGroupedDrawingCaption');
  const projected = projectGroupedShape(drawing, root, paragraphs, pageRows);
  if (projected.state !== 'placed') return projected;
  const [a, b, c, d] = projected.points;
  const rendering = drawing.source.rendering;
  if (
    a[1] !== b[1] ||
    b[0] !== c[0] ||
    c[1] !== d[1] ||
    d[0] !== a[0] ||
    b[0] <= a[0] ||
    d[1] <= a[1] ||
    rendering?.angle !== 0 ||
    !Array.isArray(rendering.flip) ||
    rendering.flip.length !== 2 ||
    !rendering.flip.every((v) => v === false)
  )
    return unavailable('UnsupportedGroupedDrawingTextTransform');
  const rectangle = { x: a[0], y: a[1], width: b[0] - a[0], height: d[1] - a[1] };
  const members = paragraphs.filter(
    (p) => p.section === drawing.section && p.drawingText?.drawingNode === drawing.drawingNode,
  );
  if (new Set(members.map((p) => p.paragraph)).size !== members.length)
    return unavailable('AmbiguousDrawingTextParagraph');
  const text = layoutDrawingText(drawing, members, declaration, rectangle, measure, {
    ...options,
    compactLines: true,
  });
  if (text.state !== 'placed') return text;
  return {
    ...text,
    rectangle,
    pageOrdinal: projected.pageOrdinal,
    rows: text.rows.map((row) => ({
      ...row,
      pageOrdinal: projected.pageOrdinal,
      referenceBoxes: projected.referenceBoxes,
    })),
  };
}
