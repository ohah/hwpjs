/** Successful rendered enable acknowledgement only; never grants save permission. */
import { observedDocInfoSummary } from './observed-docinfo-consent.mjs';
export function updateDownloadSessionStatus(node, message) {
  if (!node || message?.kind !== 'enable' || message.error || !message.content) return false;
  const content = message.content;
  const notes = [
    '편집 세션이 열렸습니다. 입력 처리가 끝나면 편집본을 다운로드할 수 있습니다.',
    '원본 조판과의 동일성은 확인되지 않았습니다.',
  ];
  if (content.primarySource === 'distribution_viewtext')
    notes.push('배포용 문서의 제한적 편집이며 저장 시 배포 플래그와 재조판 경고를 유지합니다.');
  if (content.passwordProtectionRemoved) notes.push('저장 시 비밀번호 보호는 유지되지 않습니다.');
  if (content.normalizationInfo?.normalized)
    notes.push('CFB 보정본을 저장하며 실행 취소 기준도 보정본입니다.');
  const observed = observedDocInfoSummary(content.observedDocInfoDiagnostics);
  if (observed) notes.push(observed + '. 원본 서식의 의미와 조판이 완전히 복원된 것은 아닙니다.');
  node.textContent = notes.join(' ');
  return true;
}
