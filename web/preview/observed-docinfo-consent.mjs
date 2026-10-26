export const OBSERVED_DOCINFO_WARNING =
  "불완전한 서식을 해석된 값으로 복원하지 않고 원시 데이터로 보존하는 편집 모드입니다. 일부 서식·조판은 지원되지 않을 수 있고 리소스 개수 불일치도 유지합니다. 이 모드로 편집을 시작할까요?";

export function prepareObservedDocInfoEnable(message, available, confirm) {
  if (message.kind !== "enable" || message.retainObservedDocInfo !== true) return message;
  if (!available) return null;
  return confirm(OBSERVED_DOCINFO_WARNING) === true ? message : null;
}

export function observedDocInfoSummary(value) {
  if (!value) return null;
  const total =
    value.absent_carets +
    value.unresolved_font_types +
    value.unresolved_style_characters +
    value.unresolved_character_tails +
    value.absent_fill_additionals;
  return `원본 서식 보존 모드 · 미해석/부재 ${total}개${value.resource_count_mismatch ? " · 리소스 개수 불일치 유지" : ""}`;
}
