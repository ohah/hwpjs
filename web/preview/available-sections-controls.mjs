import { failureMessage } from "./failure-message.mjs";
import { availableSectionsSummary } from "./hwp5-available-preview.mjs";

export function createAvailableSectionsControls({ button, note, reopen }) {
  let source = null, generation = 0, closed = false;
  const reset = () => { generation++; source = null; button.hidden = true; button.disabled = true; note.textContent = ""; };
  const click = () => {
    if (closed || source === null || button.disabled) return;
    const selected = source, epoch = ++generation;
    source = null; button.hidden = true; button.disabled = true;
    note.textContent = "저장된 구역의 읽기 전용 미리보기를 준비합니다…";
    const failed = error => { if (!closed && epoch === generation) note.textContent = `읽기 전용 미리보기 실패: ${failureMessage(error)}`; };
    try { Promise.resolve(reopen(selected)).catch(failed); } catch (error) { failed(error); }
  };
  button.addEventListener("click", click);
  reset();
  return {
    reset,
    offer(selected, reply) {
      reset();
      if (closed || !selected || reply?.kind !== "load" || reply.error !== "SectionCountMismatch" || reply.availableSectionsPreviewAvailable !== true) return false;
      source = selected; button.hidden = false; button.disabled = false;
      note.textContent = "원본을 수정하지 않고 저장된 구역만 볼 수 있습니다. 누락된 내용의 복원·편집·다운로드 기능이 아닙니다.";
      return true;
    },
    loaded(content) { reset(); if (!closed) note.textContent = availableSectionsSummary(content) ?? ""; },
    close() { closed = true; reset(); button.removeEventListener("click", click); },
  };
}
