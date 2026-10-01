// Command entry only. The native editor in the Worker owns editable values.
export function createEditorControls(send) {
  const panel = document.querySelector("#editor-panel"), enable = document.querySelector("#enable-edit");
  const fields = document.querySelector("#edit-fields"), note = document.querySelector("#edit-status");
  const form = document.querySelector("#edit-form");
  let ready = false, busy = false, broken = false;
  const state = () => { enable.disabled = busy || ready || broken; fields.disabled = busy || !ready || broken; };
  const run = message => { if (busy || broken || (message.kind !== "enable" && !ready)) return false; busy = true; state(); note.textContent = "처리 중…"; send(message); return true; };
  enable.addEventListener("click", () => run({ kind: "enable" }));
  const values = () => Object.fromEntries(["section", "paragraph", "startUnit", "endUnit"].map(key => [key, Number(form.elements[key].value)]));
  form.addEventListener("submit", event => { event.preventDefault(); if (busy || !ready || !form.reportValidity()) return; run({ kind: "splice", ...values(), text: form.elements.text.value }); });
  document.querySelector("#format-button").addEventListener("click", () => { if (busy || !ready || !form.reportValidity()) return; run({ kind: "format", ...values(), charShapeId: Number(form.elements.charShapeId.value) }); });
  return {
    request: run,
    ready: () => ready && !broken,
    busy: () => busy,
    reset() { panel.hidden = true; ready = false; busy = false; broken = false; note.textContent = ""; state(); },
    loaded() { panel.hidden = false; state(); },
    message(message) {
      busy = false;
      if (message.error) {
        if (message.applied) { ready = false; broken = true; }
        note.textContent = `${message.applied ? "모델 변경 후 표시 갱신 실패. 파일을 다시 선택하세요" : "변경은 적용되지 않았습니다"}: ${message.error}`;
      } else if (message.kind === "enable") {
        ready = true;
        form.elements.charShapeId.max = Math.max(0, message.charShapeCount - 1);
        note.textContent = `편집 실험을 시작했습니다 · CharShape ID: ${message.charShapeCount ? `0~${message.charShapeCount - 1}` : "없음"}`;
      } else note.textContent = "명령을 적용했습니다. 변경이 있으면 재조판 필요 · 글자 모양은 Canvas에 표시하지 않습니다.";
      state();
    },
  };
}
