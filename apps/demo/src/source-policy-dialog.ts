import { askConsent } from './consent-dialog.ts';
export function askDistributionConsent(root: HTMLElement, signal: AbortSignal) {
  return askConsent(root, signal, {
    role: 'distribution-consent',
    label: '배포용 문서 편집',
    message:
      '배포용 문서의 저장된 본문을 제한적으로 편집합니다. 저장 시 배포 플래그를 유지하며 재조판 결과는 달라질 수 있습니다.',
    accept: '배포용 문서 편집',
    acceptRole: 'accept-distribution',
    cancelRole: 'cancel-distribution',
  });
}
export function askAvailableSectionsConsent(root: HTMLElement, signal: AbortSignal) {
  return askConsent(root, signal, {
    role: 'available-sections-consent',
    label: '저장된 구역으로 사본 열기',
    message:
      '문서에 선언된 구역 수와 실제 저장된 구역 수가 다릅니다. 저장된 구역만으로 사본을 만듭니다. 누락된 구역은 복원되지 않으며 원본 파일은 변경하지 않습니다.',
    accept: '저장된 구역으로 사본 열기',
    acceptRole: 'accept-available-sections',
    cancelRole: 'cancel-available-sections',
  });
}
