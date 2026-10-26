// Display snapshots only; native current values remain authoritative.
import { hwpxParagraphGeometry } from './hwpx-paragraph-geometry.mjs';
import { paragraphFormatOptions } from './paragraph-format-options.mjs';
export function attachHwpxParagraphFormats(editor, content, available) {
  content.paragraphFormatAvailable = false;
  for (const paragraph of content.paragraphs) delete paragraph.tabDefinitionId;
  if (!editor || !available) return content;
  const ids = editor.paragraphShapeIds();
  content.paragraphShapeIds = ids;
  content.paragraphShapeCount = ids.length;
  let shapes = null;
  if (typeof editor.paragraphShapes === 'function') {
    try {
      shapes = new Map(editor.paragraphShapes().map((shape) => [shape.id, shape]));
    } catch (error) {
      content.paragraphShapesError = error.message;
    }
  }
  const sections = new Map();
  content.paragraphShapeOptions = paragraphFormatOptions(
    ids,
    shapes
      ? Array.from(shapes.values(), (shape) => ({ id: shape.id, ...hwpxParagraphGeometry(shape) }))
      : [],
  );
  for (const paragraph of content.paragraphs) {
    if (paragraph.clipped) continue;
    if (!sections.has(paragraph.section))
      sections.set(paragraph.section, editor.paragraphShapeRefs(paragraph.section));
    const refs = sections.get(paragraph.section),
      index = paragraph.paragraph + 1 - refs.firstParagraph;
    if (index < 0 || index >= refs.ids.length) throw new Error('ParagraphDisplayBindingMismatch');
    paragraph.paraShapeId = refs.ids[index];
    if (shapes) {
      const shape = shapes.get(paragraph.paraShapeId);
      if (!shape) throw new Error('ParagraphDisplayResourceMismatch');
      paragraph.paragraphShape = hwpxParagraphGeometry(shape);
      paragraph.tabDefinitionId = shape.tab_pr_id;
    }
  }
  content.paragraphFormatAvailable = true;
  return content;
}
