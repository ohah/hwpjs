import { paragraphSpacingArgs, paragraphSpacingTypes as types } from "../../js/paragraph-spacing-args.mjs";
import { currentParagraphSpacing } from "./paragraph-spacing-source.mjs";
import { steppedParagraphSpacing } from "./paragraph-spacing-step.mjs";
export function createParagraphSpacingControls({ form, fields, type, value, note, selected, request }) {
  let enabled = false, previous = null, pending = false;
  const buttons = [...(form.querySelectorAll?.("[data-spacing-step]") ?? [])];
  const update = () => {
    form.hidden = !enabled;
    const paragraph = enabled ? selected() : null;
    fields.disabled = pending || !paragraph;
    for (const button of buttons) button.disabled = pending || !paragraph || steppedParagraphSpacing(paragraph.paragraphShape, Number(button.dataset.spacingStep)) === null;
    const shape = paragraph?.paragraphShape;
    const key = paragraph ? JSON.stringify([paragraph.section, paragraph.paragraph, paragraph.paraShapeId,
      shape?.modernSpacing?.attributes, shape?.modernSpacing?.value, shape?.legacySpacingKind, shape?.legacySpacing]) : null;
    if (key !== previous) {
      const current = currentParagraphSpacing(shape);
      type.value = current ? types[current.kind] : "";
      value.value = current ? String(current.value) : "";
      previous = key;
    }
  };
  const submit = event => {
    event.preventDefault();
    if (!enabled || pending || !selected() || !form.reportValidity() || !value.value.trim()) return;
    const number = Number(value.value);
    try { paragraphSpacingArgs(type.value, number); }
    catch { note.textContent = "줄 간격 종류와 signed i32 정수 값을 확인하세요."; return; }
    if (request(type.value, number)) { pending = true; fields.disabled = true; }
  };
  form.addEventListener("submit", submit);
  const stepListeners = buttons.map(button => {
    const click = () => {
      if (!enabled || pending || button.disabled) return;
      const paragraph = selected();
      const next = steppedParagraphSpacing(paragraph?.paragraphShape, Number(button.dataset.spacingStep));
      if (next === null) return;
      if (request("PERCENT", next)) { pending = true; update(); }
    };
    button.addEventListener("click", click);
    return [button, click];
  });
  return { update, reset() { enabled = false; pending = false; previous = null; type.value = ""; value.value = ""; note.textContent = ""; update(); },
    message(message) {
      if (message.kind === "load") { enabled = false; pending = false; previous = null; }
      if (message.kind === "paragraph-spacing") pending = false;
      if (message.content && !message.error) enabled = message.content.paragraphSpacingAvailable === true;
      if (message.kind === "paragraph-spacing") note.textContent = message.error ? `줄 간격 변경 실패: ${message.error}` : "줄 간격 적용 · 원본 조판 재계산 필요";
      update();
    }, close() { form.removeEventListener("submit", submit); for (const [button, click] of stepListeners) button.removeEventListener("click", click); } };
}
