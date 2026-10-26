import { cellResizeHandle, resizedCell } from './cell-resize-geometry.mjs';
import { hwpUnitsToPixels } from './table-grid.mjs';
import { canvasDocumentPoint, canvasDragPoint } from './canvas-pointer-coordinates.mjs';

// 드래그는 임시 안내선만 소유하고 pointerup에서 native 명령을 한 번 요청합니다.
export function createCellResizeControls({ canvas, viewport, renderer, selected, request, note }) {
  const events = new AbortController();
  const listen = (type, handler) =>
    canvas.addEventListener(type, handler, { capture: true, signal: events.signal });
  let drag = null,
    available = false,
    resizeCursor = null;
  const viewScale = () => renderer.viewScale?.() ?? 1;
  const position = (event) => {
    if (drag) return canvasDragPoint(event, drag, drag.handle, drag.scale);
    const box = canvas.getBoundingClientRect();
    return canvasDocumentPoint(
      event,
      box,
      viewport.scrollTop,
      viewScale(),
      viewport.scrollLeft ?? 0,
    );
  };
  const reset = () => {
    const previous = drag;
    drag = null;
    if (resizeCursor !== null && canvas.style.cursor === resizeCursor)
      canvas.style.cursor = 'default';
    resizeCursor = null;
    renderer.cellResizeGuide?.(null);
    if (previous && canvas.hasPointerCapture(previous.id))
      canvas.releasePointerCapture(previous.id);
  };
  listen('pointerdown', (event) => {
    if (event.button !== 0 || drag || !available) return;
    const point = position(event),
      handle = cellResizeHandle(renderer.layout(), selected(), point.x, point.y);
    if (!handle) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    drag = {
      id: event.pointerId,
      handle,
      clientX: event.clientX,
      clientY: event.clientY,
      scale: viewScale(),
    };
    canvas.setPointerCapture(event.pointerId);
  });
  listen('pointermove', (event) => {
    const point = position(event);
    if (!drag) {
      if (!available) return;
      const handle = cellResizeHandle(renderer.layout(), selected(), point.x, point.y);
      if (handle) {
        resizeCursor =
          handle.horizontal && handle.vertical
            ? 'nwse-resize'
            : handle.horizontal
              ? 'ew-resize'
              : 'ns-resize';
        canvas.style.cursor = resizeCursor;
        event.stopImmediatePropagation();
      }
      return;
    }
    if (drag.id !== event.pointerId) return;
    if (drag.scale !== viewScale()) {
      reset();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const size = resizedCell(drag.handle, point.x, point.y);
    renderer.cellResizeGuide?.({
      ...drag.handle.box,
      width: drag.handle.box.width + hwpUnitsToPixels(size.width - drag.handle.width),
      height: drag.handle.box.height + hwpUnitsToPixels(size.height - drag.handle.height),
    });
    note.textContent = `셀 크기 ${size.width} × ${size.height} HWPUNIT · 놓으면 적용, Esc로 취소`;
  });
  listen('pointerup', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.scale !== viewScale()) {
      reset();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = position(event),
      handle = drag.handle;
    const size = resizedCell(handle, point.x, point.y);
    reset();
    if (size.width === handle.width && size.height === handle.height) return;
    const current = selected();
    if (
      !current ||
      current.section !== handle.section ||
      current.listNode !== handle.listNode ||
      current.width !== handle.width ||
      current.height !== handle.height
    ) {
      note.textContent = '선택이나 편집 상태가 바뀌어 크기 변경을 취소했습니다.';
      return;
    }
    if (!request(size.width, size.height))
      note.textContent = '입력 반영이 끝난 뒤 크기를 변경하세요.';
  });
  for (const type of ['pointercancel', 'lostpointercapture'])
    listen(type, (event) => {
      if (drag?.id === event.pointerId) reset();
    });
  const cancel = (event) => {
    if (event.key === 'Escape' && drag) {
      event.preventDefault();
      reset();
      note.textContent = '셀 크기 변경을 취소했습니다.';
    }
  };
  globalThis.window.addEventListener('keydown', cancel, { signal: events.signal });
  return {
    reset() {
      available = false;
      reset();
    },
    message(value) {
      if (value.kind === 'enable') available = value.cellSizeAvailable === true;
    },
    close() {
      reset();
      events.abort();
    },
  };
}
