// A bounded display projection, never a mutable document or save input.
import { retainedTextView } from "./text-offsets.mjs";
export function clipText(text, maxUnits) {
  let end = Math.min(text.length, maxUnits);
  if (end < text.length && end > 0 && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
  return text.slice(0, end);
}
export function displayContent(result, { maxUnits = 200000, maxParagraphs = 20000, paragraphOffset = 0, paragraphOrdinals = null } = {}) {
  if (![maxUnits, maxParagraphs, paragraphOffset].every(value => Number.isSafeInteger(value) && value >= 0)) throw new RangeError("InvalidDisplayBounds");
  const total = result.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
  if (paragraphOrdinals !== null && (paragraphOffset !== 0 || !Array.isArray(paragraphOrdinals)
    || paragraphOrdinals.some((value, index) => !Number.isSafeInteger(value) || value < 0 || value >= total || index > 0 && value <= paragraphOrdinals[index - 1]))) throw new RangeError("InvalidDisplayBounds");
  if (paragraphOrdinals !== null && paragraphOrdinals.length > maxParagraphs) throw new RangeError("ParagraphWindowBudgetExceeded");
  const selected = paragraphOrdinals === null ? null : new Set(paragraphOrdinals);
  const paragraphs = [];
  let units = 0, totalParagraphs = 0, ordinal = 0, limited = paragraphOffset > 0 || selected !== null && selected.size < total;
  for (const section of result.sections) {
    totalParagraphs += section.paragraphs.length;
    for (const [index, p] of section.paragraphs.entries()) {
      const current = ordinal++;
      if (selected !== null ? !selected.has(current) : current < paragraphOffset) continue;
      // Text budget must not erase paragraph identity needed by nested owners.
      // Retain bounded, noneditable clipped rows after text is exhausted.
      if (paragraphs.length >= maxParagraphs) { limited = true; continue; }
      const room = maxUnits - units;
      const retainedView = retainedTextView(p), fullText = retainedView?.text ?? p.text;
      let text = fullText;
      if (text.length > room) {
        text = clipText(text, room); limited = true;
      }
      units += text.length;
      const controls = p.tokens.filter(t => t.type === "control").length;
      // This is a display candidate, not an independently reimplemented native
      // ownership policy. The native command validates logical list membership.
      const empty = !p.textPresent && p.declaredUnits <= 1;
      const editable = !result.readOnly && (p.textPresent || empty) && text.length === fullText.length && (retainedView !== null || p.tokens.every(t => t.type !== "control" || t.code === 13));
      paragraphs.push({ section: section.index, paragraph: index, editable, label: `구역 ${section.index + 1} · 문단 ${index + 1}${p.parentNodeIndex !== null ? " · 중첩" : ""}${empty ? " · 빈 문단" : ""}${controls ? ` · 제어 표식 ${controls}개 (표시 의미 미적용)` : ""}`, text: p.textPresent || empty ? text : "[직접 텍스트 없음]" });
      if (text.length !== fullText.length) paragraphs.at(-1).clipped = true;
      paragraphs.at(-1).selectionOwner = p.parentNodeIndex === null ? `section:${section.index}:body` : null;
      if (retainedView && editable) paragraphs.at(-1).sourceOffsets = retainedView.offsets;
    }
  }
  return { format: "hwp5", version: result.version.join("."), paragraphs, totalParagraphs, limited, ...(result.readOnly ? { readOnly: true, primarySource: result.primarySource } : {}) };
}
