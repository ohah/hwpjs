// 제어문자·고립 UTF-16 surrogate는 표시 가능한 이스케이프로 바꿉니다.
// Unicode 모드이므로 올바른 surrogate 쌍은 그대로 유지합니다.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ud800-\udfff]/gu;
const MARKDOWN = /[\\`*_{}[\]()#+.!|<>~-]/gu;
const FORMATS: readonly unknown[] = ['text', 'markdown'];
const CONTENT_MARKDOWN = /[\\`*_[\]<>|~]/gu;

// 문서 본문과 호스트의 파일명·실패 메시지가 동일한 표시 정책을 사용합니다.
// 파일 읽기나 출력 예산 관리는 호출자가 담당합니다.
export function createDisplayEscaper(options: unknown): (text: unknown) => string {
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    !('format' in options) ||
    !FORMATS.includes(options.format)
  )
    throw new TypeError('InvalidRenderFormat');
  const record = options as { format: unknown; view?: unknown };
  const view = record.view === undefined ? 'content' : record.view;
  if (view !== 'content' && view !== 'structure') throw new TypeError('InvalidRenderView');
  const markdown = options.format === 'markdown';
  return (text) => {
    if (typeof text !== 'string') throw new TypeError('InvalidRenderString');
    const display = text.replace(
      CONTROL,
      (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
    );
    if (!markdown) return display;
    if (view === 'structure') return display.replace(MARKDOWN, '\\$&');
    // 본문 구두점은 유지하고 문법으로 해석될 수 있는 줄 시작만 보호합니다.
    return display
      .replace(/&/gu, '&amp;')
      .replace(CONTENT_MARKDOWN, '\\$&')
      .replace(/^ {4}/u, '&#32;   ')
      .replace(
        /^( {0,3})(#{1,6}(?=\s|$)|[-+](?=\s|$)|\d{1,9}[.)](?=\s|$)|-{3,}(?=\s|$))/u,
        (_: string, indent: string, token: string) => indent + token.replace(/[#+.\-)]/gu, '\\$&'),
      );
  };
}
