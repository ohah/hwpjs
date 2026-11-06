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
