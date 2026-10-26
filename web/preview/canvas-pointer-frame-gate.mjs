// 실제 표시와 최신 모델의 일치 여부는 renderer가 소유합니다.
// 오래된 좌표의 이벤트는 폐기하며 새 프레임에 다시 재생하지 않습니다.
export function installCanvasPointerFrameGate({
  canvas,
  renderer,
  signal,
  cancelDrag = () => {},
  onBlocked = () => {},
}) {
  const blockedPointers = new Set();
  let suppressClick = false;
  let cancelling = false;
  const current = () =>
    typeof renderer.isPaintedFrameCurrent === 'function'
      ? renderer.isPaintedFrameCurrent() === true
      : // 비동기 프레임을 노출하지 않는 기존 동기식 어댑터만 허용합니다.
        typeof renderer.paintedFrame !== 'function';
  const guard = (event) => {
    const pointer = Number.isInteger(event.pointerId),
      id = event.pointerId;
    const click = ['click', 'dblclick', 'contextmenu'].includes(event.type);
    const fresh = current();
    if (event.type === 'pointerdown' && fresh) {
      blockedPointers.delete(id);
      suppressClick = false;
    }
    if (fresh && !(pointer && blockedPointers.has(id)) && !(click && suppressClick)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    canvas.style.cursor = 'default';
    const captured = pointer && canvas.hasPointerCapture?.(id);
    if (event.type === 'pointerdown' || event.type === 'pointerup' || captured || event.buttons) {
      if (pointer) blockedPointers.add(id);
      suppressClick = true;
    }
    cancelDrag(id);
    if (captured) {
      // 후속 객체 도구의 드래그도 취소합니다. 취소 이벤트에는 가드를 걸지 않습니다.
      const realm = canvas.ownerDocument?.defaultView ?? globalThis;
      const cancel = realm.PointerEvent
        ? new realm.PointerEvent('pointercancel', { pointerId: id })
        : new (realm.Event ?? Event)('pointercancel');
      if (!realm.PointerEvent) Object.defineProperty(cancel, 'pointerId', { value: id });
      cancelling = true;
      try {
        canvas.dispatchEvent(cancel);
      } finally {
        cancelling = false;
      }
      if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    }
    if (event.type === 'pointerup') blockedPointers.delete(id);
    onBlocked(event);
  };
  for (const type of [
    'pointerdown',
    'pointermove',
    'pointerup',
    'click',
    'dblclick',
    'contextmenu',
  ]) {
    canvas.addEventListener(type, guard, { capture: true, signal });
  }
  canvas.addEventListener(
    'pointercancel',
    (event) => {
      if (!cancelling) blockedPointers.delete(event.pointerId);
    },
    { capture: true, signal },
  );
}
