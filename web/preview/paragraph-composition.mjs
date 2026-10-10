/** 여러 문단 조합의 시작 문단 표시 초안만 계산한다. 원본은 수정하지 않는다. */
export function paragraphCompositionProjection(paragraph, start, text) {
  if (!paragraph || !start || paragraph.section !== start.section || paragraph.paragraph !== start.paragraph ||
      typeof paragraph.text !== "string" || typeof text !== "string" || !text.isWellFormed() ||
      text.length > 4194304 || !Number.isSafeInteger(start.unit) || start.unit < 0 || start.unit > paragraph.text.length) return null;
  const prefix = paragraph.text.slice(0, start.unit);
  if (!prefix.isWellFormed()) return null;
  const anchor = { section: start.section, paragraph: start.paragraph, unit: start.unit, affinity: "forward" };
  return {
    draft: { section: start.section, paragraph: start.paragraph, text: prefix + text },
    composition: { anchor, focus: { ...anchor, unit: start.unit + text.length } },
  };
}
