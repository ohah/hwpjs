// Explain layout diagnostics without reclassifying parser or editing success.
const explanations = Object.freeze({
  IncompleteTableSources:
    '표 배치 정보 중 미지원 항목이 있습니다. 이 안내만으로 파일 손상을 판단할 수 없습니다.',
  UnsupportedMixedInlineTable: '일부 표의 인라인·혼합 배치 정책을 아직 지원하지 않습니다.',
  MissingHwp5PageSources:
    '현재 읽기 모드에서 페이지 정보를 사용할 수 없거나 해당 정보가 부족합니다.',
  UnsupportedHwp5SectionExtension: '구역의 확장 필드를 페이지 배치에 적용할 수 없습니다.',
  UnsupportedHwp5RectangleRoot: '현재 도형 종류·조합의 페이지 배치를 지원하지 않습니다.',
  UnsupportedHwp5PageNumberControls: '일부 본문 제어 문자를 쪽 번호 정책으로 분류하지 못했습니다.',
  MissingEffectivePageNumber: '유효 쪽 번호를 확정할 수 없습니다.',
  UnsupportedPageColumns: '현재 다단 배치 설정을 지원하지 않습니다.',
});
export function pageLayoutExplanation(error) {
  return typeof error === 'string' && Object.hasOwn(explanations, error)
    ? explanations[error]
    : null;
}
