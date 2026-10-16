// Command entry only. The native editor in the Worker owns editable values.
import { formatOptions } from "./format-options.mjs";
import { createRangePolicyControls } from "./range-policy-controls.mjs";
export function createEditorControls(send, { formatSelection = () => false, documentFormat = () => null } = {}) {
  const panel = document.querySelector("#editor-panel"), enable = document.querySelector("#enable-edit");
  const fields = document.querySelector("#edit-fields"), note = document.querySelector("#edit-status");
  const form = document.querySelector("#edit-form");
  const format = document.querySelector("#format-button");
  const canvasFormat = document.querySelector("#canvas-format-button");
  const presets = document.querySelector("#format-presets");
  let loaded = false, ready = false, busy = false, broken = false, formatAvailable = false;
  let formatIds = null;
  let distribution = false;
  const rangePolicy = createRangePolicyControls({ node: document.querySelector("#range-policy-consent"), format: documentFormat, ready: () => loaded && ready && !busy && !broken });
  const validFormat = id => {
    if (formatIds === null || formatIds.has(id)) return true;
    note.textContent = "문서에 존재하는 글자 모양 ID를 선택하세요.";
    return false;
  };
  const state = () => { enable.disabled = !loaded || busy || ready || broken; fields.disabled = busy || !ready || broken; format.disabled = fields.disabled || !formatAvailable; if (canvasFormat) canvasFormat.disabled = format.disabled; if (presets) { presets.disabled = format.disabled; presets.value = form.elements.charShapeId.value; } form.elements.charShapeId.disabled = format.disabled; format.title = formatAvailable ? "기존 글자 모양 ID 적용" : "이 세션은 글자 모양 ID 적용을 지원하지 않습니다"; };
  presets?.addEventListener("change", () => {
    if (busy || !ready || !formatAvailable || !validFormat(Number(presets.value))) return;
    form.elements.charShapeId.value = presets.value;
  });
  form.elements.charShapeId.addEventListener?.("input", () => { if (presets) presets.value = form.elements.charShapeId.value; });
  const run = message => { if (!loaded || busy || broken || (message.kind === "enable" ? ready : !ready) || (message.kind === "format" && (!formatAvailable || !validFormat(message.charShapeId)))) return false; message = rangePolicy.prepare(message); busy = true; state(); rangePolicy.refresh(); note.textContent = "처리 중…"; send(message.kind === "enable" && distribution ? { ...message, distribution: true } : message); return true; };
  enable.addEventListener("click", () => run({ kind: "enable" }));
  const values = () => Object.fromEntries(["section", "paragraph", "startUnit", "endUnit"].map(key => [key, Number(form.elements[key].value)]));
  form.addEventListener("submit", event => { event.preventDefault(); if (busy || !ready || !form.reportValidity()) return; run({ kind: "splice", ...values(), text: form.elements.text.value }); });
  format.addEventListener("click", () => { if (busy || !ready || !formatAvailable || !form.reportValidity()) return; run({ kind: "format", ...values(), charShapeId: Number(form.elements.charShapeId.value) }); });
  canvasFormat?.addEventListener("click", () => {
    if (busy || !ready || !formatAvailable || !form.elements.charShapeId.reportValidity()) return;
    if (!validFormat(Number(form.elements.charShapeId.value))) return;
    if (!formatSelection(Number(form.elements.charShapeId.value))) note.textContent = "Canvas에서 텍스트를 선택하고 입력 처리가 끝난 뒤 적용하세요.";
  });
  return {
    request: run,
    ready: () => loaded && ready && !broken,
    busy: () => busy,
    reset() { panel.hidden = true; loaded = false; ready = false; busy = false; broken = false; formatAvailable = false; formatIds = null; distribution = false; note.textContent = ""; if (presets) presets.replaceChildren(); state(); rangePolicy.reset(); },
    loaded({ distribution: selected = false } = {}) { distribution = selected; loaded = true; panel.hidden = false; state(); rangePolicy.refresh(); },
    message(message) {
      if (!loaded) return;
      busy = false;
      if (message.error) {
        if (message.applied) { ready = false; broken = true; }
        note.textContent = `${message.applied ? "모델 변경 후 표시 갱신 실패. 파일을 다시 선택하세요" : "변경은 적용되지 않았습니다"}: ${message.error}`;
      } else if (message.kind === "enable") {
        ready = true;
        if (message.charShapeIds !== undefined) {
          const ids = message.charShapeIds;
          const valid = Array.isArray(ids) && ids.length === message.charShapeCount && ids.every((id, index) => Number.isInteger(id) && id >= 0 && id <= 0xffffffff && (index === 0 || id > ids[index - 1]));
          formatIds = new Set(valid ? ids : []);
          formatAvailable = formatIds.size > 0;
          form.elements.charShapeId.max = valid && ids.length ? ids.at(-1) : 0;
          if (formatAvailable && !formatIds.has(Number(form.elements.charShapeId.value))) form.elements.charShapeId.value = String(ids[0]);
          note.textContent = `편집 실험을 시작했습니다 · CharShape ID: ${formatAvailable ? ids.slice(0, 32).join(", ") + (ids.length > 32 ? " …" : "") : "없음"}`;
        } else {
          formatIds = null;
          formatAvailable = Number.isInteger(message.charShapeCount) && message.charShapeCount > 0;
          form.elements.charShapeId.max = Math.max(0, message.charShapeCount - 1);
          note.textContent = `편집 실험을 시작했습니다 · CharShape ID: ${message.charShapeCount ? `0~${message.charShapeCount - 1}` : "없음"}`;
        }
      } else note.textContent = "명령을 적용했습니다. 변경이 있으면 재조판 필요 · 지원하는 글자 크기·굵게·기울임을 시스템 글꼴로 표시하며 원본 글꼴·페이지 조판은 재현하지 않습니다.";
      state();
      rangePolicy.refresh();
      if (presets && message.kind === "enable" && !message.error) {
        const ids = formatIds === null ? Array.from({ length: formatAvailable ? message.charShapeCount : 0 }, (_, id) => id) : [...formatIds];
        presets.replaceChildren(...formatOptions(ids, message.characterShapes).map(row => {
          const option = document.createElement("option"); option.value = row.value; option.textContent = row.label; return option;
        }));
        presets.value = form.elements.charShapeId.value;
      }
    },
  };
}
