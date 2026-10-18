// A per-response projection of native source eligibility. No mutable edit cache.
import { retainedClickProtection, restoreRetainedWindowCandidate } from "./hwp5-retained-click-policy.mjs";
// A successful section query never overrides paragraph/range protections.
export function attachHwp5TextSourcePolicy(editor, content) {
  content.textSourcePolicyAvailable = editor?.supportsTextSourcePolicy?.() === true;
  if (!content.textSourcePolicyAvailable) return content;
  const sections = new Map();
  for (const paragraph of content.paragraphs) {
    if (!sections.has(paragraph.section)) {
      let error = null, protection = null;
      try { editor.validateTextSourcePolicy(paragraph.section); }
      catch (failure) { error = failure instanceof Error ? failure.message : "TextSourcePolicyQueryFailed"; }
      if (error !== null) {
        try {
          protection = retainedClickProtection(editor, paragraph.section, error);
          if (protection) { error = null; content.retainedClickFieldProtection = true; }
        } catch (failure) { error = failure instanceof Error ? failure.message : "TextSourceProtectionQueryFailed"; }
      }
      sections.set(paragraph.section, { error, protection });
    }
    const state = sections.get(paragraph.section);
    if (state.protection && (!Number.isInteger(paragraph.paragraph) || paragraph.paragraph < 0 || paragraph.paragraph >= state.protection.protected_paragraphs.length)) {
      paragraph.textSourcePolicyError = "InvalidHwp5TextSourceProtection";
      paragraph.editable = false;
      continue;
    }
    const protectedRow = state.protection?.protected_paragraphs[paragraph.paragraph];
    const error = state.error ?? (protectedRow === true ? "UnsupportedCrossParagraphField" : null);
    if (state.protection && protectedRow === false) restoreRetainedWindowCandidate(paragraph);
    paragraph.textSourcePolicyError = error;
    if (error !== null) {
      paragraph.selectable = paragraph.clipped !== true && (paragraph.selectable === true || paragraph.editable === true);
      paragraph.editable = false;
    }
  }
  content.readOnly = !content.paragraphs.some(paragraph => paragraph.editable === true);
  return content;
}
