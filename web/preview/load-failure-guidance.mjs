import { failureMessage } from './failure-message.mjs';

// Display only: preserve the native code and never retry, repair or grant edits.
export function loadFailureMessage(error) {
  const code = failureMessage(error);
  if (code === 'SectionCountMismatch')
    return `${code}: 문서에 선언된 구역 수와 저장된 본문 구역 정보가 일치하지 않습니다. 일부 구역 누락 또는 오래된 메타데이터일 수 있으며 파일을 변경하지 않았습니다. 정상 원본이나 원본 프로그램에서 다시 저장한 사본을 확인하세요.`;
  return code;
}
