// Presentation only: the form controls remain the sole draft-value owners.
export function characterPropertyDraftLabel(bold, italic) {
  const labels = { keep: '유지', on: '켜기', off: '끄기' };
  const label = (value) => (Object.hasOwn(labels, value) ? labels[value] : '미확인');
  return `강조 일괄값 · 굵게 ${label(bold)} · 기울임 ${label(italic)}`;
}
