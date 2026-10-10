import { pageReferenceBoxes } from "./page-reference-boxes.mjs";

// 물리 페이지 순서의 좌표만 소유합니다. 단과 텍스트 흐름은 호출자가 소유합니다.
export function pageSequenceReference(setting, ordinal, { x = 20, y = 20, gap = 20 } = {}) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ![x, y, gap].every(Number.isFinite) || gap < 0) return { state: "invalid_page_sequence" };
  const first = pageReferenceBoxes(setting, { x, y });
  if (first.state !== "placed") return first;
  const offset = y + ordinal * (first.boxes.paper.height + gap);
  if (!Number.isFinite(offset)) return { state: "invalid_page_sequence" };
  return pageReferenceBoxes(setting, { x, y: offset }, ordinal);
}
