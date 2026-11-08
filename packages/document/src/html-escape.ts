import { createDisplayEscaper } from './render-escape.ts';

const display = createDisplayEscaper({ format: 'text', view: 'content' });
const entities: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 기존 표시 제어문자 정책을 재사용하며 큰 중간 이스케이프 문자열을 만들지 않습니다. */
export function escapeHTMLText(value: string, maxOutputUnits: number): string {
  if (typeof value !== 'string') throw new TypeError('InvalidRenderString');
  if (!Number.isSafeInteger(maxOutputUnits) || maxOutputUnits < 0)
    throw new RangeError('InvalidHtmlEscapeLimit');
  const chunks: string[] = [];
  let units = 0;
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 512, value.length);
    if (end < value.length) {
      const high = value.charCodeAt(end - 1),
        low = value.charCodeAt(end);
      if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) end--;
    }
    const chunk = display(value.slice(start, end)).replace(/[&<>"']/gu, (c) => entities[c]!);
    units += chunk.length;
    if (units > maxOutputUnits) throw new RangeError('RenderOutputLimitExceeded');
    chunks.push(chunk);
    start = end;
  }
  return chunks.join('');
}
