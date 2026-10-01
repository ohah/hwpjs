// A bounded display projection, never a mutable document or save input.
export function clipText(text, maxUnits) {
  let end = Math.min(text.length, maxUnits);
  if (end < text.length && end > 0 && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
  return text.slice(0, end);
}
export function displayContent(result, { maxUnits = 200000, maxParagraphs = 20000 } = {}) {
  const paragraphs = [];
  let units = 0, totalParagraphs = 0, limited = false;
  for (const section of result.sections) {
    totalParagraphs += section.paragraphs.length;
    for (const [index, p] of section.paragraphs.entries()) {
      if (paragraphs.length >= maxParagraphs || units >= maxUnits) { limited = true; continue; }
      const room = maxUnits - units;
      let text = p.text;
      if (text.length > room) {
        text = clipText(text, room); limited = true;
      }
      units += text.length;
      const controls = p.tokens.filter(t => t.type === "control").length;
      // This is a display candidate, not an independently reimplemented native
      // ownership policy. The native command validates logical list membership.
      const editable = p.textPresent && text.length === p.text.length && p.tokens.every(t => t.type !== "control" || t.code === 13);
      paragraphs.push({ section: section.index, paragraph: index, editable, label: `구역 ${section.index + 1} · 문단 ${index + 1}${p.parentNodeIndex !== null ? " · 중첩" : ""}${controls ? ` · 제어 표식 ${controls}개 (표시 의미 미적용)` : ""}`, text: p.textPresent ? text : "[직접 텍스트 없음]" });
    }
  }
  return { version: result.version.join("."), paragraphs, totalParagraphs, limited };
}
