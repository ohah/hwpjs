// 현재 문단 모양의 표시용 복사본이며 편집 모델이 아닙니다.
import { paragraphFormatOptions } from './paragraph-format-options.mjs';
import { hwp5ParagraphGeometry } from './hwp5-paragraph-geometry.mjs';
export function attachHwp5ParagraphFormats(editor, content, available) {
  content.paragraphFormatAvailable = false;
  if (!editor || content.readOnly || !available) return content;
  content.paragraphShapeCount = editor.paragraphShapeCount();
  let shapes = null;
  try {
    shapes = editor.paragraphShapes();
  } catch (error) {
    content.paragraphDisplayError = error.message;
  }
  content.paragraphShapeOptions = paragraphFormatOptions(
    Array.from({ length: content.paragraphShapeCount }, (_, id) => id),
    shapes ?? [],
  );
  for (const paragraph of content.paragraphs) {
    if (!paragraph.clipped) {
      paragraph.paraShapeId = editor.paragraphShapeId(paragraph.section, paragraph.paragraph);
      if (shapes) {
        const shape = shapes[paragraph.paraShapeId];
        // Cell/drawing projections can omit the document envelope. Retain the
        // source format so they do not inherit prototype font floors/insets.
        paragraph.paragraphShape = hwp5ParagraphGeometry(shape);
      }
    }
  }
  content.paragraphFormatAvailable = true;
  return content;
}
