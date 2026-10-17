export const NORMALIZATION_WARNING = "이 문서는 CFB 메타데이터 보정이 필요합니다. 원본 파일은 변경하지 않지만 저장 및 실행 취소 기준은 보정본입니다. 원본 파일 바이트와 동일한 저장을 보장하지 않습니다. 보정본으로 편집을 시작할까요?";
export function prepareNormalizationEnable(message, available, confirm) {
  if (message.kind !== "enable" || !available) return message;
  return confirm(NORMALIZATION_WARNING) === true ? { ...message, normalizeObservedCfb: true } : null;
}
