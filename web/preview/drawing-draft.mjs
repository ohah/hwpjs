import { projectDraftAnchoredObjects } from "./anchored-object-draft.mjs";

// 일시적 소유 문단 이름만 변환합니다. 변경 구간 계산은 공통 구현에 둡니다.
export function projectDraftDrawings(content, draft) {
  if (!draft) return content.drawings;
  const adapted = (content.drawings ?? []).map(drawing => ({ ...drawing, paragraph: drawing.hostParagraph, state: "located" }));
  return projectDraftAnchoredObjects(content, adapted, draft).map(({ paragraph, state, ...drawing }) => ({ ...drawing, hostParagraph: paragraph }));
}
