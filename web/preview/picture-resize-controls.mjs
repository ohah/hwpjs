import {
  pictureResizeBasis,
  pictureResizeHandles,
  resizedPicture,
} from './picture-resize-geometry.mjs';
import { pageContainsPoint } from './page-visible-rectangle.mjs';
import { canvasDocumentPoint } from './canvas-pointer-coordinates.mjs';

export function createPictureResizeControls({
  canvas,
  viewport,
  renderer,
  selected,
  request,
  note,
  window = globalThis.window,
}) {
  const events = new AbortController();
  let drag = null,
    available = false,
    cursor = null,
    closed = false;
  const listen = (type, fn) =>
    canvas.addEventListener(type, fn, { capture: true, signal: events.signal });
  const viewScale = () => renderer.viewScale?.() ?? 1;
  const point = (event) => {
    const value = canvasDocumentPoint(
      event,
      canvas.getBoundingClientRect(),
      viewport.scrollTop,
      viewScale(),
      viewport.scrollLeft ?? 0,
    );
    return [value.x, value.y];
  };
  const basis = () =>
    !closed && available
      ? pictureResizeBasis(renderer.selectedPicturePaint?.(), selected(), {
          allowPartialHandles: true,
        })
      : null;
  const same = (current, previous) =>
    current &&
    ['section', 'pictureNode', 'resizeRecordNode', 'width', 'height'].every(
      (key) => current[key] === previous[key],
    ) &&
    ['origin', 'x', 'y'].every((key) =>
      current[key].every((value, index) => value === previous[key][index]),
    );
  const visible = (value, position) =>
    value.pageClip === undefined || pageContainsPoint(value.pageClip, ...position);
  const hit = (value, position) =>
    value && visible(value, position)
      ? pictureResizeHandles(value).find(
          (handle) => Math.hypot(position[0] - handle.point[0], position[1] - handle.point[1]) <= 7,
        )
      : null;
  renderer.pictureResizeSelection?.(basis);
  const reset = () => {
    const previous = drag;
    drag = null;
    if (cursor && canvas.style.cursor === cursor) canvas.style.cursor = 'default';
    cursor = null;
    renderer.pictureResizeGuide?.(null);
    if (previous && canvas.hasPointerCapture(previous.id))
      canvas.releasePointerCapture(previous.id);
  };
  listen('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    const value = basis(),
      position = point(event);
    const handle = position.every(Number.isFinite) ? hit(value, position) : null;
    if (!handle) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    drag = {
      id: event.pointerId,
      basis: value,
      handle,
      scale: viewScale(),
      offset: [handle.point[0] - position[0], handle.point[1] - position[1]],
    };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      reset();
    }
  });
  const resized = (event) => {
    const value = point(event);
    return resizedPicture(drag.basis, [value[0] + drag.offset[0], value[1] + drag.offset[1]], {
      ...drag.handle,
      preserveAspect: event.shiftKey === true,
    });
  };
  listen('pointermove', (event) => {
    if (!drag) {
      const value = basis(),
        position = point(event);
      const handle = hit(value, position);
      if (handle) {
        const xLength = Math.hypot(...value.x),
          yLength = Math.hypot(...value.y);
        const vector =
          handle.horizontal && handle.vertical
            ? [
                value.x[0] / xLength + value.y[0] / yLength,
                value.x[1] / xLength + value.y[1] / yLength,
              ]
            : handle.horizontal
              ? value.x
              : value.y;
        const angle = ((Math.atan2(vector[1], vector[0]) * 180) / Math.PI + 180) % 180;
        cursor =
          angle < 22.5 || angle >= 157.5
            ? 'ew-resize'
            : angle < 67.5
              ? 'nwse-resize'
              : angle < 112.5
                ? 'ns-resize'
                : 'nesw-resize';
        canvas.style.cursor = cursor;
        event.stopImmediatePropagation();
      } else if (cursor) {
        if (canvas.style.cursor === cursor) canvas.style.cursor = 'default';
        cursor = null;
      }
      return;
    }
    if (drag.id !== event.pointerId) return;
    if (drag.scale !== viewScale()) {
      reset();
      return;
    }
    if (!same(basis(), drag.basis)) {
      reset();
      note.textContent = '편집 상태나 레이아웃이 바뀌어 그림 크기 변경을 취소했습니다.';
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const size = resized(event);
    if (size) {
      renderer.pictureResizeGuide?.({ basis: drag.basis, size });
      note.textContent = `그림 크기 ${size.width} × ${size.height} HWPUNIT · 놓으면 적용, Esc로 취소`;
    }
  });
  listen('pointerup', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.scale !== viewScale()) {
      reset();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const size = resized(event),
      previous = drag.basis;
    reset();
    const current = basis();
    if (!size || !same(current, previous)) {
      note.textContent = '선택이나 편집 상태가 바뀌어 그림 크기 변경을 취소했습니다.';
      return;
    }
    if (size.width === previous.width && size.height === previous.height) return;
    if (!request(size.width, size.height))
      note.textContent = '그림 크기 변경을 적용할 수 없습니다.';
  });
  for (const type of ['pointercancel', 'lostpointercapture'])
    listen(type, (event) => {
      if (drag?.id === event.pointerId) reset();
    });
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && drag) {
        event.preventDefault();
        reset();
        note.textContent = '그림 크기 변경을 취소했습니다.';
      }
    },
    { signal: events.signal },
  );
  return {
    reset() {
      available = false;
      reset();
    },
    message(value) {
      if (closed) return;
      if (value.kind === 'load' || (value.applied && value.error)) {
        available = false;
        reset();
      }
      if (value.kind === 'enable')
        available = !value.error && value.pictureResizeAvailable === true;
    },
    close() {
      if (closed) return;
      closed = true;
      available = false;
      reset();
      renderer.pictureResizeSelection?.(null);
      events.abort();
    },
  };
}
