// Result drafts are UI-only; native history owns committed result text.
export function createFormulaResultControls({ fields, input, apply, note, ready, request }) {
  let row = null, enabled = false, available = false, closed = false;
  const update = () => {
    fields.hidden = closed || !available;
    fields.disabled = closed || !available || !enabled || !ready() || !row;
  };
  const select = value => { row = value ?? null; input.value = row?.last_result ?? ""; update(); };
  const click = () => {
    update();
    if (fields.disabled || !row) return;
    note.textContent = request({ kind: "manual-formula-result", origin: "formula", section: row.section, beginElement: row.beginElement, display: input.value }) ? "결과 반영 중…" : "입력 반영이 끝난 뒤 적용하세요.";
    update();
  };
  apply.addEventListener("click", click);
  const keydown = event => {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    click();
  };
  input.addEventListener("keydown", keydown);
  const reset = () => { row = null; enabled = false; available = false; input.value = ""; update(); };
  return {
    update, select, reset, available: () => available && !closed,
    message(message, selected) {
      if (closed) return;
      if (["load", "unlock"].includes(message.kind)) reset();
      if (message.kind === "enable" && !message.error) enabled = true;
      if (message.content) {
        available = message.content.manualFormulaResultAvailable === true;
        const same = row && selected && row.section === selected.section && row.beginElement === selected.beginElement && row.last_result === selected.last_result;
        const authoritative = ["load", "unlock", "enable", "undo", "redo"].includes(message.kind) || (!message.error && ["formula-definition", "manual-formula-result"].includes(message.kind));
        if (!same || authoritative) select(selected);
        else row = selected;
      }
      if (message.kind === "manual-formula-result") note.textContent = message.error ? `결과 변경 실패: ${message.error}` : "결과 적용 완료";
      update();
    },
    close() { if (closed) return; closed = true; apply.removeEventListener("click", click); input.removeEventListener("keydown", keydown); reset(); },
  };
}
