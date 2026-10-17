// Re-selecting the same file must emit change; do not reload or mutate the session.
export function createChartOlePolicyControls({ checkbox, file, note }) {
  if (!checkbox || !file || !note) throw new TypeError("MissingChartOlePolicyControls");
  let closed = false;
  const change = () => {
    if (closed) return;
    file.value = "";
    note.textContent = "설정은 다음 문서 열기에 적용됩니다. 현재 편집 세션은 바뀌지 않았습니다.";
  };
  checkbox.addEventListener("change", change);
  return { close() { if (closed) return; closed = true; checkbox.removeEventListener("change", change); } };
}
