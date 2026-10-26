/** Navigation changes only the viewport, never the canonical chart or history. */
export function createChartLocationControl({ button, available, selected, reveal, note }) {
  let closed = false;
  const update = () => {
    if (button) button.disabled = closed || !available() || !selected();
  };
  const click = () => {
    if (closed || !available() || !selected()) return;
    const target = selected();
    if (!reveal(target.section, target.wrapper))
      note.textContent = "현재 차트의 배치 위치를 표시할 수 없습니다.";
  };
  button?.addEventListener("click", click);
  return {
    update,
    close() {
      closed = true;
      button?.removeEventListener("click", click);
      update();
    },
  };
}
