// 비동기 명령 뒤에 보낼 단일 줄 입력의 형식과 한도만 소유합니다.
export function appendQueuedText(queued, text, limit = 1024 * 1024) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('InvalidQueuedInputLimit');
  if (
    typeof queued !== 'string' ||
    typeof text !== 'string' ||
    !queued.isWellFormed() ||
    !text.isWellFormed() ||
    /[\r\n]/.test(text)
  )
    return { accepted: false };
  if (queued.length > limit || text.length > limit - queued.length)
    return { accepted: true, overflow: true, text: queued };
  return { accepted: true, text: queued + text };
}
