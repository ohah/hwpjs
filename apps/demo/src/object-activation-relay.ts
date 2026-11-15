import type { CanvasObjectActivation } from '@hwpjs/vanilla';
type Listener = (event: CanvasObjectActivation) => void;
type Host = { registerObjectActivation(listener: Listener): () => void };
/** Keep subscriptions across delayed mounts and StrictMode surface replacement. */
export function createObjectActivationRelay() {
  const listeners = new Map<Listener, (() => void) | undefined>();
  let host: Host | undefined,
    disposed = false;
  return {
    connect(next: Host | undefined) {
      if (disposed || next === host) return;
      for (const stop of listeners.values()) stop?.();
      host = next;
      for (const listener of listeners.keys())
        listeners.set(listener, host?.registerObjectActivation(listener));
    },
    register(listener: Listener) {
      if (disposed) return () => {};
      if (!listeners.has(listener))
        listeners.set(listener, host?.registerObjectActivation(listener));
      return () => {
        listeners.get(listener)?.();
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of listeners.values()) stop?.();
      listeners.clear();
      host = undefined;
    },
  };
}
