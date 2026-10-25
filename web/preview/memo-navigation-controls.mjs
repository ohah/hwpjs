// Navigation only. Canvas/native own selection, permissions and all edits.
export function createMemoNavigationControls({ panel, form, list, button, note, select }) {
  let entries = new Map(), closed = false;
  const reset = () => {
    entries = new Map(); list.replaceChildren(); list.disabled = button.disabled = true;
    panel.hidden = true; note.textContent = "";
  };
  const submit = event => {
    event.preventDefault();
    if (closed || button.disabled) return;
    const entry = entries.get(list.value);
    if (!entry) return;
    note.textContent = select({ section: entry.section, paragraph: entry.paragraph, startUnit: 0, endUnit: 0 }) === true
      ? "Canvas 메모를 선택했습니다."
      : "현재 표시 범위에 없거나 입력 반영 중입니다.";
  };
  form.addEventListener("submit", submit); reset();
  return {
    reset,
    show(content) {
      if (closed) return;
      const previous = list.value; reset();
      if (content?.format !== "hwp5" || content.hwp5MemoErrors?.length || !Array.isArray(content.hwp5Memos)) return;
      const paragraphs = new Map(content.paragraphs.map(row => [`${row.section}:${row.paragraph}`, row]));
      for (const memo of content.hwp5Memos) {
        const paragraph = memo.paragraphs[0], row = paragraphs.get(`${memo.section}:${paragraph}`);
        if (!row || row.clipped || row.editable !== true && row.selectable !== true) continue;
        const key = `${memo.section}:${memo.memoNode}`;
        if (entries.has(key)) { reset(); return; }
        entries.set(key, { section: memo.section, paragraph });
        const option = list.ownerDocument.createElement("option");
        option.value = key;
        option.textContent = `구역 ${memo.section + 1} · 메모 ${memo.memoIndex} · ${row.text.slice(0, 60)}`;
        list.append(option);
      }
      if (!entries.size) return;
      list.value = entries.has(previous) ? previous : entries.keys().next().value;
      panel.hidden = false; list.disabled = button.disabled = false;
      note.textContent = `${entries.size}개 · 현재 표시 문서의 메모 · 원본 측면 배치 아님`;
    },
    close() { if (closed) return; closed = true; form.removeEventListener("submit", submit); reset(); },
  };
}
