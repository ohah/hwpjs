// Requests only; current state remains native/Worker-owned until its response.
import { canvasDocumentPoint } from './canvas-pointer-coordinates.mjs';
export function createCheckBoxCanvasControls({ canvas, viewport, renderer, note, ready, request }) {
  let pending = false,
    selected = null,
    closed = false;
  const baseLabel = canvas.getAttribute?.('aria-label') ?? '문서 내용 Canvas';
  const label = (row) =>
    canvas.setAttribute(
      'aria-label',
      `${row.caption ?? '체크박스'} · ${row.state} · ${row.editable ? 'Space로 상태 변경' : '읽기 전용'}`,
    );
  const reset = () => {
    pending = false;
    selected = null;
    note.textContent = '';
    canvas.setAttribute('aria-label', baseLabel);
  };
  const current = () =>
    renderer
      .checkBoxProxies()
      .find(
        (box) =>
          box.checkBox.section === selected?.section &&
          box.checkBox.formNode === selected?.formNode,
      )?.checkBox;
  const apply = (row) => {
    if (closed || pending || !ready() || row?.editable !== true) return false;
    const cycle = row.triState
      ? ['UNCHECKED', 'CHECKED', 'INDETERMINATE']
      : ['UNCHECKED', 'CHECKED'];
    const at = cycle.indexOf(row.state),
      state =
        at < 0
          ? row.state === 'INDETERMINATE'
            ? 'CHECKED'
            : null
          : cycle[(at + 1) % cycle.length];
    if (state === null) return false;
    pending = true;
    try {
      if (
        !request({
          kind: 'checkbox-state',
          origin: 'checkbox',
          section: row.section,
          formNode: row.formNode,
          state,
        })
      ) {
        pending = false;
        return false;
      }
    } catch (error) {
      pending = false;
      note.textContent = `체크박스 요청 실패: ${error.message}`;
      return false;
    }
    note.textContent = '체크박스 상태 반영 중…';
    return true;
  };
  const hit = (event) => {
    const bounds = canvas.getBoundingClientRect();
    const point = canvasDocumentPoint(
      event,
      bounds,
      viewport.scrollTop,
      renderer.viewScale?.() ?? 1,
      viewport.scrollLeft ?? 0,
    );
    return renderer.checkBoxAtLogicalPoint(point.x, point.y)?.checkBox;
  };
  const pointer = (event) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const row = hit(event);
    if (!row) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selected = { section: row.section, formNode: row.formNode };
    label(row);
    if (apply(row)) canvas.focus();
  };
  const hover = (event) => {
    if (event.buttons) return;
    const row = hit(event);
    if (row?.editable && ready() && !pending) {
      canvas.style.cursor = 'pointer';
      event.stopImmediatePropagation();
    }
  };
  const key = (event) => {
    if (
      event.key !== ' ' ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const row = current();
    if (!row) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    apply(row);
  };
  canvas.addEventListener('pointerdown', pointer, { capture: true });
  canvas.addEventListener('pointermove', hover, { capture: true });
  canvas.addEventListener('keydown', key, { capture: true });
  return {
    reset,
    message(message) {
      if (message.kind === 'load' || message.kind === 'unlock') reset();
      if (message.content && selected) {
        const row = message.content.checkBoxes?.find(
          (value) => value.section === selected.section && value.formNode === selected.formNode,
        );
        if (row) label(row);
        else {
          selected = null;
          canvas.setAttribute('aria-label', baseLabel);
        }
      }
      if (message.kind === 'checkbox-state') {
        pending = false;
        note.textContent = message.error
          ? `체크박스 변경 실패: ${message.error}`
          : '체크박스 상태를 적용했습니다.';
      }
    },
    close() {
      if (closed) return;
      closed = true;
      canvas.removeEventListener('pointerdown', pointer, { capture: true });
      canvas.removeEventListener('pointermove', hover, { capture: true });
      canvas.removeEventListener('keydown', key, { capture: true });
      reset();
    },
  };
}
