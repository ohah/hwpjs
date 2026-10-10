import { HWPX_DISPLAY_BOUNDS } from "./hwpx-content.mjs";

export function createDocumentWindowControls({ form, start, count, apply, restore, note, ready, request }) {
  let closed = false, total = 0, format = null;
  const refresh = () => {
    const enabled = !closed && format === "hwpx" && total > 0 && ready();
    for (const node of [start, count, apply, restore]) node.disabled = !enabled;
  };
  const integer = node => /^\d+$/.test(node.value) ? Number(node.value) : NaN;
  const submit = event => {
    event.preventDefault();
    if (closed || apply.disabled || !ready()) return;
    const first = integer(start), length = integer(count);
    if (!Number.isSafeInteger(first) || first < 1 || first > total || !Number.isSafeInteger(length) || length < 1 || length > HWPX_DISPLAY_BOUNDS.maxParagraphs) {
      note.textContent = "문서 범위 안의 시작 문단과 표시 문단 수를 입력하세요.";
      return;
    }
    if (request({ kind: "set-edit-window", offset: first - 1, count: Math.min(length, total - first + 1) }) === true) note.textContent = "구간 조회 중…";
    refresh();
  };
  const full = () => {
    if (closed || restore.disabled || !ready()) return;
    if (request({ kind: "set-edit-window", offset: null, count: null }) === true) note.textContent = "기본 표시 복원 중…";
    refresh();
  };
  form.addEventListener("submit", submit);
  restore.addEventListener("click", full);
  refresh();
  return {
    refresh,
    reset() { total = 0; format = null; start.value = "1"; count.value = "100"; note.textContent = ""; refresh(); },
    message(message) {
      if (closed) return;
      if (message.error) { if (message.kind === "set-edit-window") note.textContent = `구간 이동 실패: ${message.error}`; refresh(); return; }
      if (!message.content) return;
      const content = message.content;
      total = Number.isSafeInteger(content.totalParagraphs) && content.totalParagraphs >= 0 ? content.totalParagraphs : 0;
      format = content.format;
      start.max = String(total);
      count.max = String(HWPX_DISPLAY_BOUNDS.maxParagraphs);
      if (["load", "unlock"].includes(message.kind)) { start.value = "1"; count.value = "100"; }
      if (content.window) {
        if (message.kind === "set-edit-window") start.value = String(content.window.requestedOffset + 1);
        note.textContent = `문단 ${content.window.paragraphOffset + 1}~${content.window.paragraphOffset + content.window.paragraphCount} / ${total} · 객체 소유 문단 포함 · 원본 쪽 번호 아님`;
      } else note.textContent = total ? `${total}문단 · 기본 표시 한도 적용` : "";
      refresh();
    },
    close() { if (closed) return; closed = true; form.removeEventListener("submit", submit); restore.removeEventListener("click", full); refresh(); },
  };
}
