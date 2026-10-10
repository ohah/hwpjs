// Clipboard I/O does not own the selection or the document transaction.
export async function transferSelectedText({ clipboard, text, isCurrent, cut, remove, report }) {
  if (typeof text !== "string" || !text || !isCurrent()) return false;
  if (typeof clipboard?.writeText !== "function") {
    report("이 환경에서는 시스템 클립보드를 사용할 수 없습니다.");
    return false;
  }
  try { await clipboard.writeText(text); }
  catch {
    if (isCurrent()) report("클립보드 쓰기가 거부되었습니다.");
    return false;
  }
  if (!isCurrent()) return false;
  if (cut) return remove() === true;
  report("선택 텍스트 복사 완료");
  return true;
}
