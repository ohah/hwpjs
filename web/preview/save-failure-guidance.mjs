/** Save refusal guidance only: never grants consent or retries a command. */
export function presentSaveFailure(note, message, { format, consent }) {
  if (message?.kind !== 'save' || !message.error) return false;
  note.textContent = `저장 실패: ${message.error}`;
  if (format !== 'hwp5' || message.error !== 'LayoutReflowRequired' || !consent || consent.disabled)
    return true;
  const label = consent.closest('label');
  if (label?.hidden !== false) return true;
  note.textContent +=
    ' · 원본 배치 정보는 재계산되지 않았습니다. 경고를 확인하고 ‘원본 배치 정보 유지 저장 허용’을 직접 선택한 뒤 다시 저장하세요.';
  consent.focus({ preventScroll: true });
  label.scrollIntoView({ block: 'center', inline: 'nearest' });
  return true;
}
