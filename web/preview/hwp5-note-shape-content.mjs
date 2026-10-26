import { validateHwp5NoteShapeSources } from '../../js/hwp5-note-shape-sources.mjs';
import { selectHwp5NotePagePolicy } from './hwp5-note-page-policy.mjs';

export function attachHwp5NoteShapes(editor, content) {
  content.hwp5NoteShapes = [];
  content.hwp5NotePolicies = [];
  content.hwp5NoteShapeErrors = [];
  if (!editor) return content;
  const sections = new Set(
    (content.currentParagraphFlows ?? [])
      .filter((row) => ['footnote', 'endnote'].includes(row.host))
      .map((row) => row.section),
  );
  for (const section of sections) {
    try {
      const shapes = validateHwp5NoteShapeSources(editor.noteShapeSources(section));
      // 원값 조회와 표시 정책 실패는 분리하며 미지원 정책을 selected로 바꾸지 않습니다.
      const policies = shapes.map((shape) => selectHwp5NotePagePolicy(shapes, section, shape.kind));
      content.hwp5NoteShapes.push({ section, shapes });
      for (const [index, policy] of policies.entries()) {
        if (policy.state === 'selected') content.hwp5NotePolicies.push(policy);
        else
          content.hwp5NoteShapeErrors.push({
            section,
            kind: shapes[index].kind,
            error: policy.error,
          });
      }
    } catch (error) {
      content.hwp5NoteShapeErrors.push({ section, error: error.message });
    }
  }
  return content;
}
