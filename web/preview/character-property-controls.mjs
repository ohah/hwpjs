import { characterPropertyArgs } from "../../js/character-property-args.mjs";
import { isSourceCharacterSize } from "./character-size-selection.mjs";
import { steppedCharacterSize } from "./character-size-step.mjs";
import { characterPropertyDraftLabel } from "./character-property-draft-label.mjs";
export function createCharacterPropertyControls({ form, fields, size, bold, italic, note, selected, request, boldToggle, italicToggle, underlineToggle, strikeToggle, selectedState = () => null, selectedSize = () => null, selectedRanges = () => null, toggle = () => false, canType = () => false }) {
  let enabled = false;
  let typingAvailable = false;
  let rangesAvailable = false;
  let pending = false;
  const selection = () => enabled ? selected() ?? (rangesAvailable ? selectedRanges() : null) : null;
  const accepted = range => Array.isArray(range) ? rangesAvailable && range.length > 0 && range.every(part => Number.isInteger(part?.startUnit) && Number.isInteger(part?.endUnit) && part.startUnit >= 0 && part.startUnit < part.endUnit) : Boolean(range) && (range.startUnit !== range.endUnit || (typingAvailable && canType()));
  const buttons = [["bold", boldToggle], ["italic", italicToggle], ["underline", underlineToggle], ["strike", strikeToggle]].filter(([, button]) => button);
  const sizeButtons = [[1, form.querySelector?.('[data-size-step="1"]')], [-1, form.querySelector?.('[data-size-step="-1"]')]].filter(([, button]) => typeof button?.addEventListener === "function");
  const draftLabel = form.querySelector?.("#character-property-draft");
  const updateDraftLabel = () => { if (draftLabel) draftLabel.textContent = characterPropertyDraftLabel(bold.value, italic.value); };
  const draftInputs = [bold, italic].filter(input => typeof input?.addEventListener === "function");
  for (const input of draftInputs) input.addEventListener("change", updateDraftLabel);
  const update = () => {
    updateDraftLabel();
    form.hidden = !enabled;
    const range = selection();
    fields.disabled = pending || !accepted(range);
    const currentSize = enabled ? selectedSize() : null;
    for (const [direction, button] of sizeButtons) button.disabled = pending || !accepted(range) || steppedCharacterSize(currentSize, direction) === null;
    size.placeholder = currentSize === "mixed" ? "혼합" : isSourceCharacterSize(currentSize) ? String(currentSize / 100) : "유지";
    const currentLabel = form.querySelector?.("#character-property-size-current");
    if (currentLabel) currentLabel.textContent = currentSize === "mixed" ? "현재 크기 혼합" : isSourceCharacterSize(currentSize) ? `현재 ${currentSize / 100}pt` : "현재 크기 미확인";
    for (const [property, button] of buttons) {
      const state = enabled ? selectedState(property) : null;
      button.disabled = pending || state === null;
      button.setAttribute("aria-pressed", state === "mixed" ? "mixed" : String(state === true));
    }
  };
  const clicks = buttons.map(([property, button]) => {
    const click = () => { if (!pending && enabled && selectedState(property) !== null && toggle(property)) update(); };
    button.addEventListener("click", click);
    return [button, click];
  });
  const sizeClicks = sizeButtons.map(([direction, button]) => {
    const click = () => {
      if (pending || button.disabled) return;
      const range = selection();
      const next = steppedCharacterSize(enabled ? selectedSize() : null, direction);
      if (!accepted(range) || next === null) return;
      if (request({ size: next })) {
        if (!Array.isArray(range) && range.startUnit === range.endUnit) {
          note.textContent = "다음 입력의 글자 크기 지정 · 입력 전에는 문서가 변경되지 않습니다.";
          update();
        } else {
          pending = true;
          update();
        }
      }
    };
    button.addEventListener("click", click);
    return [button, click];
  });
  const submit = event => {
    event.preventDefault();
    const range = selection();
    if (pending || !accepted(range) || !form.reportValidity()) return;
    const properties = {};
    try {
      const text = size.value.trim();
      if (text) {
        if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("InvalidCharacterSize");
        const [whole, fraction = ""] = text.split(".");
        properties.size = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      }
      for (const [key, input] of [["bold", bold], ["italic", italic]]) {
        if (input.value === "keep") continue;
        if (!["on", "off"].includes(input.value)) throw new Error("InvalidCharacterProperties");
        properties[key] = input.value === "on";
      }
      characterPropertyArgs(properties);
    } catch { note.textContent = "크기는 0~4096pt, 소수 두 자리까지 입력하세요. 강조 상태도 확인하세요."; return; }
    if (!Object.keys(properties).length) return;
    if (request(properties)) {
      if (!Array.isArray(range) && range.startUnit === range.endUnit) { note.textContent = "다음 입력의 글자 속성 지정 · 입력 전에는 문서가 변경되지 않습니다."; update(); }
      else { pending = true; update(); }
    }
  };
  form.addEventListener("submit", submit);
  return {
    update,
    reset() { enabled = false; typingAvailable = false; rangesAvailable = false; pending = false; size.value = ""; bold.value = italic.value = "keep"; note.textContent = ""; update(); },
    message(message) {
      if (["character-properties", "character-properties-ranges"].includes(message.kind)) pending = false;
      if (message.kind === "load") this.reset();
      if (message.content && !message.error) enabled = message.content.characterPropertiesAvailable === true;
      if (message.content && !message.error) typingAvailable = message.content.characterPropertyTextAvailable === true;
      if (message.content && !message.error) rangesAvailable = message.content.characterPropertiesRangesAvailable === true;
      if (["character-properties", "character-properties-ranges"].includes(message.kind)) note.textContent = message.error ? `글자 속성 변경 실패: ${message.error}` : "글자 속성 적용 · 원본 조판 재계산 필요";
      if (["character-underline", "character-underline-ranges"].includes(message.kind)) note.textContent = message.error ? `밑줄 변경 실패: ${message.error}` : "밑줄 위치 적용 · 지원 선 모양 표시 · 원본 조판 재계산 필요";
      if (["character-strike", "character-strike-ranges"].includes(message.kind)) note.textContent = message.error ? `취소선 변경 실패: ${message.error}` : "취소선 적용 · 지원 선 모양 표시 · 원본 조판 재계산 필요";
      update();
    },
    close() { form.removeEventListener("submit", submit); for (const input of draftInputs) input.removeEventListener("change", updateDraftLabel); for (const [button, click] of [...clicks, ...sizeClicks]) button.removeEventListener("click", click); },
  };
}
