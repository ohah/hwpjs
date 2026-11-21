import {
  pictureResizeBasis,
  pictureResizeHandles,
  resizedPicture,
  pictureResizeFixedAnchor,
  pictureResizeAnchorSizeSupported,
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
  anchoredResize,
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
  const hit = (value, position) => {
    if (!value || !visible(value, position)) return null;
    let closest = null,
      distance = Infinity;
    for (const handle of pictureResizeHandles(value)) {
      const next = Math.hypot(position[0] - handle.point[0], position[1] - handle.point[1]);
      if (next <= 7 && next < distance) {
        closest = handle;
        distance = next;
      }
    }
    return closest;
  };
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
    let anchored;
    try {
      anchored = anchoredResize?.capture();
    } catch {
      anchored = null;
    }
    // Null blocks a pending/failed query. Undefined alone selects legacy mode.
    if (anchored === null) {
      note.textContent = '그림 반대점 고정 편집 권한을 확인하고 있습니다.';
      return;
    }
    drag = {
      anchored,
      anchor: anchored === undefined ? undefined : pictureResizeFixedAnchor(handle),
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
    const size = resizedPicture(
      drag.basis,
      [value[0] + drag.offset[0], value[1] + drag.offset[1]],
      {
        ...drag.handle,
        preserveAspect: event.shiftKey === true,
      },
    );
    if (
      drag.anchored !== undefined &&
      !pictureResizeAnchorSizeSupported(drag.basis, size, drag.anchor)
    ) {
      note.textContent = '반대쪽 중간점을 정수 위치로 유지할 수 없어 크기 변경을 취소합니다.';
      return null;
    }
    return size;
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
                (handle.xSide * value.x[0]) / xLength + (handle.ySide * value.y[0]) / yLength,
                (handle.xSide * value.x[1]) / xLength + (handle.ySide * value.y[1]) / yLength,
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
      renderer.pictureResizeGuide?.({
        basis: drag.basis,
        size,
        ...(drag.anchored === undefined ? {} : { mode: 'anchored', anchor: drag.anchor }),
      });
      note.textContent = `그림 크기 ${size.width} × ${size.height} HWPUNIT · 놓으면 적용, Esc로 취소`;
    } else renderer.pictureResizeGuide?.(null);
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
      previous = drag.basis,
      anchored = drag.anchored,
      anchor = drag.anchor;
    reset();
    const current = basis();
    if (!size || !same(current, previous)) {
      note.textContent =
        !size && anchored !== undefined
          ? '반대쪽 중간점을 정수 위치로 유지할 수 없어 크기 변경을 취소했습니다.'
          : '선택이나 편집 상태가 바뀌어 그림 크기 변경을 취소했습니다.';
      return;
    }
    if (size.width === previous.width && size.height === previous.height) return;
    let accepted = false;
    try {
      accepted =
        anchored === undefined
          ? request(size.width, size.height)
          : anchoredResize?.request(anchored, size.width, size.height, anchor) === true;
    } catch {
      accepted = false;
    }
    if (!accepted) note.textContent = '그림 크기 변경을 적용할 수 없습니다.';
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
