// A per-response projection of native source eligibility. No mutable edit cache.
// A successful section query never overrides paragraph/range protections.
export function attachHwp5TextSourcePolicy(editor, content) {
  content.textSourcePolicyAvailable = editor?.supportsTextSourcePolicy?.() === true;
  if (!content.textSourcePolicyAvailable) return content;
  const sections = new Map();
  for (const paragraph of content.paragraphs) {
    if (!sections.has(paragraph.section)) {
      let error = null;
      try { editor.validateTextSourcePolicy(paragraph.section); }
      catch (failure) { error = failure instanceof Error ? failure.message : "TextSourcePolicyQueryFailed"; }
      sections.set(paragraph.section, error);
    }
    const error = sections.get(paragraph.section);
    paragraph.textSourcePolicyError = error;
    if (error !== null) {
      paragraph.selectable = paragraph.clipped !== true && (paragraph.selectable === true || paragraph.editable === true);
      paragraph.editable = false;
    }
  }
  content.readOnly = !content.paragraphs.some(paragraph => paragraph.editable === true);
  return content;
}
