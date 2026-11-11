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
      `${row.caption ?? '체크박스'} · ${row.state} · ${row.editable ? (row.kind === 'radio_button' ? 'Space로 선택' : 'Space로 상태 변경') : '읽기 전용'}`,
    );
  const reset = () => {
    pending = false;
    selected = null;
    note.textContent = '';
    canvas.setAttribute('aria-label', baseLabel);
  };
  const current = () =>
    selected?.nativeHwp5 && renderer.currentHwp5Choice
      ? renderer.currentHwp5Choice(selected.section, selected.formNode)
      : renderer
          .checkBoxProxies()
          .find(
            (box) =>
              box.checkBox.section === selected?.section &&
              box.checkBox.formNode === selected?.formNode,
          )?.checkBox;
  const apply = (row) => {
    if (closed || pending || !ready() || row?.editable !== true) return false;
    const radio = row.kind === 'radio_button';
    if (radio && !['UNCHECKED', 'CHECKED'].includes(row.state)) return false;
    const cycle = row.triState
      ? ['UNCHECKED', 'CHECKED', 'INDETERMINATE']
      : ['UNCHECKED', 'CHECKED'];
    const at = cycle.indexOf(row.state),
      state = radio
        ? 'CHECKED'
        : at < 0
          ? row.state === 'INDETERMINATE'
            ? 'CHECKED'
            : null
          : cycle[(at + 1) % cycle.length];
    if (state === null) return false;
    pending = true;
    try {
      const message = radio
        ? { kind: 'radio-select', origin: 'radio', section: row.section, formNode: row.formNode }
        : {
            kind: 'checkbox-state',
            origin: 'checkbox',
            section: row.section,
            formNode: row.formNode,
            state,
          };
      if (!request(message)) {
        pending = false;
        return false;
      }
    } catch (error) {
      pending = false;
      note.textContent = `${radio ? '라디오' : '체크박스'} 요청 실패: ${error.message}`;
      return false;
    }
    note.textContent = radio ? '라디오 선택 반영 중…' : '체크박스 상태 반영 중…';
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
    selected = {
      section: row.section,
      formNode: row.formNode,
      nativeHwp5: row.format !== 'hwpx' && ['check_box', 'radio_button'].includes(row.kind),
    };
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
        if (Array.isArray(message.content.hwp5Forms)) {
          // Reflow updates the value projection synchronously; a paint frame
          // may still be pending. Never toggle from an old painted value.
          queueMicrotask(() => {
            if (!closed && selected) {
              const row = current();
              if (row) label(row);
              else {
                selected = null;
                canvas.setAttribute('aria-label', baseLabel);
              }
            }
          });
        } else {
          const row = message.content.checkBoxes?.find(
            (value) => value.section === selected.section && value.formNode === selected.formNode,
          );
          if (row) label(row);
          else {
            selected = null;
            canvas.setAttribute('aria-label', baseLabel);
          }
        }
      }
      if (message.kind === 'checkbox-state' || message.kind === 'radio-select') {
        pending = false;
        const name = message.kind === 'radio-select' ? '라디오 선택' : '체크박스 상태';
        note.textContent = message.error
          ? `${name} 변경 실패: ${message.error}`
          : `${name}를 적용했습니다.`;
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
