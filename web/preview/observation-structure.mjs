// 관측 전용 구조 검사: 값/색 비트/Native 지원 의미를 만들지 않습니다.
export const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function observationRows(rows) {
  if (!Array.isArray(rows)) return null;
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object" || !uint(row.id) || map.has(row.id)) return null;
    map.set(row.id, row);
  }
  return map;
}
export function observationSpans(paragraph) {
  const spans = paragraph?.characterRanges;
  if (typeof paragraph?.text !== "string" || !Array.isArray(spans)) return null;
  let previous = 0;
  for (const span of spans) {
    if (
      !span ||
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < previous ||
      span.start < 0 ||
      span.start > span.end ||
      span.end > paragraph.text.length
    )
      return null;
    previous = span.end;
  }
  return spans;
}
