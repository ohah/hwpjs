import { availableSectionsSummary } from './hwp5-available-preview.mjs';
import { createDocumentReopenChoice } from './document-reopen-choice.mjs';

export function createAvailableSectionsControls(options) {
  return createDocumentReopenChoice({
    ...options,
    accepts: (reply) =>
      reply?.kind === 'load' &&
      reply.error === 'SectionCountMismatch' &&
      reply.availableSectionsPreviewAvailable === true,
    summary: availableSectionsSummary,
    offered:
      '원본을 수정하지 않고 저장된 구역만 볼 수 있습니다. 누락된 내용의 복원·편집·다운로드 기능이 아닙니다.',
    preparing: '저장된 구역의 읽기 전용 미리보기를 준비합니다…',
    failed: '읽기 전용 미리보기 실패',
  });
}
