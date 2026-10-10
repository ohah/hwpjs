export function createTableCreationControls({ form, fields, focusButton, submit, dimensions, resources, note, selected, inventory, request, createOption = () => document.createElement("option") }) {
  let closed = false, signature = null;
  const update = () => {
    if (closed) return;
    const ids = inventory();
    const ready = Boolean(selected() && ids && Object.keys(resources).every(key => Array.isArray(ids[key]) && ids[key].length));
    fields.disabled = !ready; focusButton.disabled = !ready; submit.disabled = !ready;
    const next = JSON.stringify(ids);
    if (next !== signature) {
      for (const [key, select] of Object.entries(resources)) {
        const previous = select.value;
        select.replaceChildren(...(ids?.[key] ?? []).map(id => { const option = createOption(); option.value = String(id); option.textContent = `ID ${id}`; return option; }));
        select.value = ids?.[key]?.some(id => String(id) === previous) ? previous : String(ids?.[key]?.[0] ?? "");
      }
      signature = next;
    }
  };
  const focus = () => { update(); if (!closed && !focusButton.disabled) { form.scrollIntoView?.({ block: "nearest" }); dimensions.rows.focus(); } };
  const insert = event => {
    event.preventDefault(); update();
    if (closed || fields.disabled || !selected() || !form.reportValidity()) return;
    const options = Object.fromEntries(Object.entries(dimensions).map(([key, node]) => [key, Number(node.value)]));
    options.resources = Object.fromEntries(Object.entries(resources).map(([key, node]) => [key, Number(node.value)]));
    note.textContent = request(options) ? "표 생성 중…" : "현재 선택에서는 표를 생성할 수 없습니다.";
    update();
  };
  focusButton.addEventListener("click", focus); form.addEventListener("submit", insert);
  update();
  return { update, close() { if (closed) return; closed = true; focusButton.removeEventListener("click", focus); form.removeEventListener("submit", insert); fields.disabled = true; focusButton.disabled = true; submit.disabled = true; } };
}
