import { measureInlineObjectParagraph } from "./inline-object-paragraph-measurement.mjs";

// 표 API의 식별자와 오류 계약을 유지하는 얇은 어댑터입니다.
export function measureInlineTableParagraph(paragraph, entries, width, measure, options) {
  const objects = Array.isArray(entries) ? entries.map(entry => entry && ({ ...entry, objectNode: entry.tableNode })) : entries;
  const result = measureInlineObjectParagraph(paragraph, objects, width, measure, options);
  if (result.state !== "measured") return { ...result, error: result.error.replace("InlineObject", "InlineTable") };
  return { ...result, anchors: result.anchors.map(({ objectNode, ...anchor }) => ({ tableNode: objectNode, ...anchor })) };
}
