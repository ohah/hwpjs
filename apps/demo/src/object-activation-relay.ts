import type {
  CanvasObjectActivation,
  CanvasObjectPropertiesRequest,
  CanvasSelectedObject,
} from '@hwpjs/vanilla';
type Listener = (event: CanvasObjectActivation) => void;
type PropertiesListener = (event: CanvasObjectPropertiesRequest) => void;
type Host = {
  getSelectedObject?(): CanvasSelectedObject | null;
  requestSelectedObjectProperties?(): boolean;
  registerObjectPropertiesControl?(element: HTMLElement): () => void;
  subscribeObjectSelection?(listener: () => void): () => void;
  registerObjectActivation(listener: Listener): () => void;
  registerObjectPropertiesRequest?(listener: PropertiesListener): () => void;
};

/** Keep subscriptions across delayed mounts and StrictMode surface replacement. */
export function createObjectActivationRelay() {
  const listeners = new Map<Listener, (() => void) | undefined>();
  const controls = new Map<HTMLElement, { stop?: () => void }>();
  const selections = new Map<() => void, { stop?: () => void }>();
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
      for (const record of controls.values()) {
        record.stop?.();
        record.stop = undefined;
      }
      for (const record of selections.values()) {
        record.stop?.();
        record.stop = undefined;
      }
      host = undefined;
      const pending = new Map<Listener, () => void>();
      let stopProperties: (() => void) | undefined;
      const pendingControls = new Map<HTMLElement, () => void>();
      const pendingSelections = new Map<() => void, () => void>();
      try {
        for (const key of controls.keys()) {
          const stop = next?.registerObjectPropertiesControl?.(key);
          if (stop) pendingControls.set(key, stop);
        }
        for (const key of selections.keys()) {
          const stop = next?.subscribeObjectSelection?.(key);
          if (stop) pendingSelections.set(key, stop);
        }
        if (properties)
          stopProperties = next?.registerObjectPropertiesRequest?.(properties.listener);
        for (const listener of listeners.keys()) {
          const stop = next?.registerObjectActivation(listener);
          if (stop) pending.set(listener, stop);
        }
      } catch (error) {
        stopProperties?.();
        for (const stop of pendingControls.values()) stop();
        for (const stop of pendingSelections.values()) stop();
        for (const stop of pending.values()) stop();
        throw error;
      }
      host = next;
      for (const [key, stop] of pendingControls) controls.get(key)!.stop = stop;
      for (const [key, stop] of pendingSelections) selections.get(key)!.stop = stop;
      if (properties) properties.stop = stopProperties;
      for (const [listener, stop] of pending) listeners.set(listener, stop);
    },
    getSelectedObject() {
      const current = host;
      const selected = disposed ? null : (current?.getSelectedObject?.() ?? null);
      return !disposed && host === current ? selected : null;
    },
    requestSelectedObjectProperties() {
      return !disposed && (host?.requestSelectedObjectProperties?.() ?? false);
    },
    registerObjectPropertiesControl(element: HTMLElement) {
      if (disposed) return () => {};
      controls.get(element)?.stop?.();
      const record = { stop: host?.registerObjectPropertiesControl?.(element) };
      controls.set(element, record);
      return () => {
        if (controls.get(element) === record) {
          record.stop?.();
          controls.delete(element);
        }
      };
    },
    subscribeObjectSelection(listener: () => void) {
      if (disposed) return () => {};
      selections.get(listener)?.stop?.();
      const record = { stop: host?.subscribeObjectSelection?.(listener) };
      selections.set(listener, record);
      return () => {
        if (selections.get(listener) === record) {
          record.stop?.();
          selections.delete(listener);
        }
      };
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
      for (const record of controls.values()) record.stop?.();
      controls.clear();
      for (const record of selections.values()) record.stop?.();
      selections.clear();
      properties?.stop?.();
      properties = null;
      host = undefined;
    },
  };
}
