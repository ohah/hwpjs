// Explanations supplement native errors; they never change edit permissions.
export function structureErrorMessage(operation, code) {
  const explanations = {
    UnsupportedColumnBoundaryEdit: "이 단 설정 경계의 문단 구조 편집은 아직 지원하지 않습니다.",
    CrossParagraphOwner: "서로 다른 본문·셀·개체 소유권을 넘는 문단 구조 편집은 지원하지 않습니다.",
    InvalidParagraphAdjacency: "원본 구조에서 연속하지 않는 문단은 병합할 수 없습니다.",
  };
  return `문단 ${operation} 실패: ${code}${Object.hasOwn(explanations, code) ? ` · ${explanations[code]}` : ""}`;
}
