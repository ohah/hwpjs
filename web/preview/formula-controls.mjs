// The form edits a draft; native Worker responses own current definitions.
import { createFormulaResultControls } from "./formula-result-controls.mjs";
export function createFormulaControls({
  form,
  fields,
  choices,
  input,
  note,
  ready,
  request,
  result,
  definitionApply,
}) {
  const resultControls = result
    ? createFormulaResultControls({ ...result, note, ready, request })
    : null;
  let rows = [],
    enabled = false,
    available = false,
    closed = false;
  const selected = () => rows.find((row) => `${row.section}:${row.beginElement}` === choices.value);
  const update = () => {
    form.hidden = closed || rows.length === 0;
    fields.disabled =
      closed || (!available && !resultControls?.available()) || !enabled || !ready() || !selected();
    input.disabled = !available;
    if (definitionApply) definitionApply.disabled = !available;
    resultControls?.update();
  };
  const select = (refreshResult = true) => {
    input.value = selected()?.formula ?? "";
    if (refreshResult) resultControls?.select(selected());
    update();
  };
  choices.addEventListener("change", select);
  const submit = (event) => {
    event.preventDefault();
    update();
    const row = selected();
    if (fields.disabled || !available || !row || !form.reportValidity()) return;
    update();
    if (fields.disabled || !available || selected() !== row) return;
    if (new TextEncoder().encode(input.value).length > 4096) {
      note.textContent = "수식은 UTF-8 4096바이트 이하여야 합니다.";
      return;
    }
    note.textContent = request({
      kind: "formula-definition",
      origin: "formula",
      section: row.section,
      beginElement: row.beginElement,
      formula: input.value,
    })
      ? "수식 반영 중…"
      : "입력 반영이 끝난 뒤 적용하세요.";
    update();
  };
  form.addEventListener("submit", submit);
  const reset = () => {
    rows = [];
    enabled = false;
    available = false;
    choices.replaceChildren();
    input.value = "";
    note.textContent = "";
    resultControls?.reset();
    update();
  };
  return {
    reset,
    update,
    close() {
      if (closed) return;
      closed = true;
      resultControls?.close();
      choices.removeEventListener("change", select);
      form.removeEventListener("submit", submit);
      reset();
    },
    selectCanvas(row) {
      if (closed) return;
      if (
        !row ||
        !rows.some(
          (value) => value.section === row.section && value.beginElement === row.beginElement,
        )
      )
        return;
      const key = `${row.section}:${row.beginElement}`;
      if (choices.value !== key) {
        choices.value = key;
        select();
      }
    },
    message(message) {
      if (closed) return;
      if (message.kind === "load" || message.kind === "unlock") reset();
      if (message.kind === "enable" && !message.error) enabled = true;
      if (message.content) {
        available = message.content.formulaDefinitionAvailable === true;
        const previous = choices.value;
        const previousFormula = selected()?.formula;
        const draft = input.value;
        rows = message.content.formulas ?? [];
        choices.replaceChildren(
          ...rows.map((row) => {
            const option = choices.ownerDocument.createElement("option");
            option.value = `${row.section}:${row.beginElement}`;
            option.textContent = `구역 ${row.section + 1} · 수식 ${row.beginElement} · ${row.last_result ?? ""}`;
            return option;
          }),
        );
        if (rows.some((row) => `${row.section}:${row.beginElement}` === previous))
          choices.value = previous;
        select(false);
        const authoritative =
          ["load", "unlock", "enable", "undo", "redo"].includes(message.kind) ||
          (message.kind === "formula-definition" && !message.error);
        if (!authoritative && choices.value === previous && selected()?.formula === previousFormula)
          input.value = draft;
      }
      if (message.kind === "formula-definition")
        note.textContent = message.error ? `수식 변경 실패: ${message.error}` : "수식 적용 완료";
      resultControls?.message(message, selected());
      update();
    },
  };
}
