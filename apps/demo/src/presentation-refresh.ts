/** Only schedules presentation. The caller returns request() to the editor's
 * observer error channel; no state, selection, capability or request is cached. */
export function createPresentationRefresh(refresh: () => void) {
  let pending = false;
  let disposed = false;
  return {
    request(): Promise<void> | undefined {
      if (disposed || pending) return;
      pending = true;
      return Promise.resolve().then(() => {
        pending = false;
        if (!disposed) refresh();
      });
    },
    dispose() {
      disposed = true;
    },
  };
}

/** DOM 이벤트는 표시 갱신만 요청합니다. 실제 선택·권한은 기존 포트에서 다시 읽습니다. */
export function observeSelectionPresentation(
  root: EventTarget | null | undefined,
  refresh: () => Promise<void> | undefined,
  report: (error: unknown) => void,
): () => void {
  if (!root) return () => {};
  const events = ['select', 'keyup', 'pointerup', 'pointercancel', 'input', 'focusout'];
  const options = { capture: true };
  const listener = () => {
    try {
      void refresh()?.catch(report);
    } catch (error) {
      report(error);
    }
  };
  for (const event of events) root.addEventListener(event, listener, options);
  return () => {
    for (const event of events) root.removeEventListener(event, listener, options);
  };
}
