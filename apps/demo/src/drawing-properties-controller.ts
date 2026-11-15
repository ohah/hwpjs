import type {
  DrawingPropertiesCapture,
  DrawingPropertiesPort,
  DrawingPropertiesTarget,
} from './drawing-properties-port.ts';
export interface DrawingPropertiesView {
  show(): void;
  destroy(): void;
}
export function createDrawingPropertiesController(options: {
  port: DrawingPropertiesPort;
  createView(capture: DrawingPropertiesCapture, onDismiss: () => void): DrawingPropertiesView;
  onStatus?(text: string): void;
  onClose?(): void;
  onPresentationChange?(): void;
  onError?(error: unknown): void;
}) {
  let disposed = false,
    opening = false;
  let session: { capture: DrawingPropertiesCapture; view?: DrawingPropertiesView } | undefined;
  const report = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      /* Host callback boundary. */
    }
  };
  const notify = (callback: (() => void) | undefined) => {
    try {
      callback?.();
    } catch (error) {
      report(error);
    }
  };
  function close() {
    const prior = session;
    session = undefined;
    if (!prior) return;
    try {
      prior.view?.destroy();
    } catch (error) {
      report(error);
    }
    // Invalidated documents must never receive a focus-restoration callback.
    if (!disposed && prior.view && options.port.current(prior.capture)) notify(options.onClose);
    notify(options.onPresentationChange);
  }
  const unsubscribe = options.port.subscribe(() => {
    if (session && !options.port.current(session.capture)) close();
  });
  return {
    open(target: DrawingPropertiesTarget): boolean {
      if (disposed || opening) return false;
      opening = true;
      try {
        close();
        if (disposed) return false;
        const result = options.port.capture(target);
        if (!result.capture) {
          notify(() => options.onStatus?.(result.reason ?? '도형 정보를 확인할 수 없습니다.'));
          return false;
        }
        const active = { capture: result.capture } as {
          capture: DrawingPropertiesCapture;
          view?: DrawingPropertiesView;
        };
        session = active;
        const view = options.createView(active.capture, () => {
          if (session === active) close();
        });
        active.view = view;
        if (disposed || session !== active || !options.port.current(active.capture)) {
          if (session === active) close();
          else view.destroy();
          return false;
        }
        view.show();
        if (disposed || session !== active || !options.port.current(active.capture)) {
          if (session === active) close();
          return false;
        }
        notify(options.onPresentationChange);
        return true;
      } catch (error) {
        close();
        report(error);
        return false;
      } finally {
        opening = false;
      }
    },
    close,
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        unsubscribe();
      } finally {
        close();
      }
    },
  };
}
