import type { CanvasObjectActivation, CanvasObjectPropertiesRequest } from '@hwpjs/vanilla';
type Listener = (event: CanvasObjectActivation) => void;
type PropertiesListener = (event: CanvasObjectPropertiesRequest) => void;
type Host = {
  registerObjectActivation(listener: Listener): () => void;
  registerObjectPropertiesRequest?(listener: PropertiesListener): () => void;
};

/** Keep subscriptions across delayed mounts and StrictMode surface replacement. */
export function createObjectActivationRelay() {
  const listeners = new Map<Listener, (() => void) | undefined>();
  let properties: { listener: PropertiesListener; stop?: () => void } | null = null;
  let host: Host | undefined,
    disposed = false;
  return {
    connect(next: Host | undefined) {
      if (disposed || next === host) return;
      for (const [listener, stop] of listeners) {
        stop?.();
        listeners.set(listener, undefined);
      }
      properties?.stop?.();
      if (properties) properties.stop = undefined;
      host = undefined;
      const pending = new Map<Listener, () => void>();
      let stopProperties: (() => void) | undefined;
      try {
        if (properties)
          stopProperties = next?.registerObjectPropertiesRequest?.(properties.listener);
        for (const listener of listeners.keys()) {
          const stop = next?.registerObjectActivation(listener);
          if (stop) pending.set(listener, stop);
        }
      } catch (error) {
        stopProperties?.();
        for (const stop of pending.values()) stop();
        throw error;
      }
      host = next;
      if (properties) properties.stop = stopProperties;
      for (const [listener, stop] of pending) listeners.set(listener, stop);
    },
    registerProperties(listener: PropertiesListener) {
      if (disposed) return () => {};
      if (properties) throw Error('ObjectPropertiesOwnerAlreadyAttached');
      const record = { listener, stop: host?.registerObjectPropertiesRequest?.(listener) };
      properties = record;
      return () => {
        if (properties === record) {
          properties = null;
          record.stop?.();
        }
      };
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
      properties?.stop?.();
      properties = null;
      host = undefined;
    },
  };
}
