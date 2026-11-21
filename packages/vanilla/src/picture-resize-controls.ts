// @ts-ignore Canonical geometry/drag implementation; this module only owns Surface admission.
import { createPictureResizeControls } from '../../../web/preview/picture-resize-controls.mjs';

export interface SurfacePictureResizeScope {
  readonly state: object;
  readonly selection: object;
  readonly lease: object;
  readonly source: object;
  readonly modalRevision: unknown;
  readonly target: Readonly<{
    section: number;
    pictureNode: number;
    resizeRecordNode?: number;
    width: number;
    height: number;
  }>;
}
/** A certified current picture is required; hit testing alone never issues this scope. */
export function createSurfacePictureResizeControls(options: {
  canvas: HTMLCanvasElement;
  viewport: HTMLElement;
  window: Window;
  renderer: object;
  capture(): SurfacePictureResizeScope | null;
  request(width: number, height: number): boolean;
  note: { textContent: string };
}) {
  const events = new AbortController();
  let shared: ReturnType<typeof createPictureResizeControls> | undefined;
  let closed = false,
    enabled = false,
    resetting = false;
  let observed: unknown;
  let down: { scope: SurfacePictureResizeScope; pointerId: number } | null = null;
  let releasing: SurfacePictureResizeScope | null = null;
  const read = () => {
    if (closed || !enabled) return null;
    try {
      return options.capture();
    } catch {
      return null;
    }
  };
  const current = (scope: SurfacePictureResizeScope) => {
    const next = read();
    return (
      !!next &&
      ['state', 'selection', 'lease', 'source', 'modalRevision'].every(
        (key) =>
          next[key as keyof SurfacePictureResizeScope] ===
          scope[key as keyof SurfacePictureResizeScope],
      ) &&
      ['section', 'pictureNode', 'resizeRecordNode', 'width', 'height'].every(
        (key) =>
          next.target[key as keyof typeof next.target] ===
          scope.target[key as keyof typeof scope.target],
      )
    );
  };
  const cancel = () => {
    down = null;
    if (resetting || !shared) return;
    resetting = true;
    try {
      shared.reset();
      shared.message({ kind: 'enable', pictureResizeAvailable: enabled && !closed });
    } finally {
      resetting = false;
    }
  };
  const pointerAllowed = (event: PointerEvent) =>
    event.isTrusted === true &&
    event.isPrimary === true &&
    !event.defaultPrevented &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey;
  // Forward DOM operations to their real receiver. The shared controller retains
  // all hit testing, projection, guide rendering and one pointerup resize policy.
  const guarded = new Proxy(options.canvas, {
    get(canvas, key) {
      if (key === 'addEventListener')
        return (
          type: string,
          listener: (event: PointerEvent) => void,
          settings: AddEventListenerOptions,
        ) =>
          canvas.addEventListener(
            type,
            (raw) => {
              const event = raw as PointerEvent;
              if (closed || resetting) return;
              if (type === 'pointercancel' || type === 'lostpointercapture') {
                // releasePointerCapture during the owned pointerup is normal cleanup.
                if (!releasing) cancel();
                listener(event);
                return;
              }
              if (!pointerAllowed(event)) {
                if (down) cancel();
                return;
              }
              if (type === 'pointerdown') {
                if (event.button !== 0 || down) return;
                const scope = read();
                if (!scope) return;
                down = { scope, pointerId: event.pointerId };
                listener(event);
                // Read synchronously after this exact canonical handler, before any
                // generic selection listener can claim the same event.
                if (!event.defaultPrevented) down = null;
                return;
              }
              if (down && (!current(down.scope) || down.pointerId !== event.pointerId)) {
                cancel();
                return;
              }
              if (type === 'pointerup') {
                if (!down) return;
                const scope = down.scope;
                releasing = scope;
                try {
                  listener(event);
                } finally {
                  releasing = null;
                  down = null;
                }
                return;
              }
              listener(event);
            },
            settings,
          );
      const value = Reflect.get(canvas, key, canvas);
      return typeof value === 'function' ? value.bind(canvas) : value;
    },
  });
  shared = createPictureResizeControls({
    ...options,
    canvas: guarded,
    selected: () => read()?.target ?? null,
    request(width: number, height: number) {
      const scope = releasing;
      if (!scope || !current(scope)) return false;
      return options.request(width, height);
    },
  });
  const listen = (target: EventTarget, type: string, listener: EventListener) =>
    target.addEventListener(type, listener, { capture: true, signal: events.signal });
  listen(options.window, 'blur', (event) => {
    if (event.target === options.window) cancel();
  });
  listen(options.viewport, 'scroll', (event) => {
    if (event.target === options.viewport) cancel();
  });
  listen(options.window, 'keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape' && down) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
      options.note.textContent = '그림 크기 변경을 취소했습니다.';
    }
  });
  return {
    observeState(state: unknown) {
      const value = state as {
        status?: unknown;
        capabilities?: { pictureResizeAvailable?: unknown; readOnly?: unknown };
      };
      const available =
        value?.status === 'ready' &&
        value.capabilities?.pictureResizeAvailable === true &&
        value.capabilities.readOnly !== true;
      const changed = observed !== state || enabled !== available;
      observed = state;
      enabled = available;
      if (changed) cancel();
    },
    cancel,
    close() {
      if (closed) return;
      closed = true;
      enabled = false;
      down = null;
      releasing = null;
      events.abort();
      shared.close();
    },
  };
}
