const names = ["left", "right", "indent", "before", "after"];

export function createParagraphMarginControls({ form, fields, inputs, note, selected, request }) {
  let enabled = false, previous = null, pending = false;
  const update = () => {
    form.hidden = !enabled;
    const paragraph = enabled ? selected() : null;
    fields.disabled = pending || !paragraph;
    const key = paragraph ? JSON.stringify([paragraph.section, paragraph.paragraph, paragraph.paraShapeId,
      ...names.map(name => paragraph.paragraphShape?.[name])]) : null;
    if (key !== previous) {
      for (const name of names) inputs[name].value = paragraph?.paragraphShape?.[name] == null ? "" : String(paragraph.paragraphShape[name]);
      previous = key;
    }
  };
  const submit = event => {
    event.preventDefault();
    if (!enabled || pending || !selected() || !form.reportValidity()) return;
    const margins = {};
    for (const name of names) {
      const raw = inputs[name].value.trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
        note.textContent = "여백은 signed i32 범위의 정수 HWPUNIT으로 입력하세요.";
        return;
      }
      margins[name] = value;
    }
    if (request(margins)) { pending = true; fields.disabled = true; }
  };
  form.addEventListener("submit", submit);
  return {
    update,
    reset() {
      enabled = false; pending = false; previous = null;
      for (const name of names) inputs[name].value = "";
      note.textContent = ""; update();
    },
    message(value) {
      if (value.kind === "load") { enabled = false; pending = false; previous = null; }
      if (value.kind === "paragraph-margins") pending = false;
      if (value.content && !value.error) enabled = value.content.paragraphMarginsAvailable === true;
      if (value.kind === "paragraph-margins") note.textContent = value.error ? `문단 여백 변경 실패: ${value.error}` : "문단 여백 적용 · 원본 조판 재계산 필요";
      update();
    },
    close() { form.removeEventListener("submit", submit); },
  };
}
