/** Surface measurement ordinals are independent of source numbering and caret selection. */
export interface DemoPageStatusHost {
  getPageStatus?():
    | Readonly<{
        current: number | null;
        total: number | null;
        partial: boolean;
      }>
    | null
    | undefined;
  subscribePageStatus?(listener: () => void): () => void;
}

/** Framework effects may mount/recreate their Surface after the demo subscribes. */
export function createPageStatusRelay() {
  let source: DemoPageStatusHost | undefined, unsubscribe: (() => void) | undefined;
  let disposed = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    const listenersSnapshot = Array.from(listeners);
    for (const listener of listenersSnapshot) listener();
  };
  return {
    getPageStatus: () => source?.getPageStatus?.(),
    subscribePageStatus(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect(next: DemoPageStatusHost) {
      if (disposed) return;
      unsubscribe?.();
      source = next;
      unsubscribe = next.subscribePageStatus?.(notify);
      notify();
    },
    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      source = undefined;
      listeners.clear();
    },
  };
}

export function pageStatusLabel(ready: boolean, busy: boolean, host?: DemoPageStatusHost): string {
  if (!ready || busy) return '';
  const value = host?.getPageStatus?.();
  if (!value) return '';
  const valid = (n: number | null): n is number => Number.isSafeInteger(n) && n! > 0;
  const total = !value.partial && valid(value.total) ? value.total : null;
  const current =
    valid(value.current) && (total === null || value.current <= total) ? value.current : null;
  if (value.partial)
    return `부분 미리보기 내 ${current === null ? '쪽 미확인' : `${current}쪽`} · 전체 쪽수 미확인`;
  return `미리보기 ${current ?? '미확인'} / ${total === null ? '전체 쪽수 미확인' : `${total}쪽`}`;
}
