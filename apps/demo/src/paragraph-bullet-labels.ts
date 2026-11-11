/** Display text only. Values and numeric fields stay on the Native DTO axis. */
export const bulletAlignmentLabels = [
  ['LEFT', '왼쪽'],
  ['CENTER', '가운데'],
  ['RIGHT', '오른쪽'],
] as const;
export const bulletOffsetLabels = [
  ['PERCENT', '글자 크기에 대한 비율 (%)'],
  ['HWPUNIT', '고정 거리 (문서 단위)'],
] as const;
export function bulletOffsetLabel(unit: string): string {
  return unit === 'PERCENT'
    ? '본문 간격 (%)'
    : unit === 'HWPUNIT'
      ? '본문 간격 (문서 단위)'
      : '본문 간격 (단위 미확인)';
}
