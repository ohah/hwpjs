// @ts-ignore Canonical geometry/drag implementation; this module only owns Surface admission.
import { createPictureResizeControls } from '../../../web/preview/picture-resize-controls.mjs';
// @ts-ignore Canonical physical-selector mapping, shared by the Surface adapter.
import { anchoredPictureResizeSelector } from '../../../web/preview/picture-resize-target.mjs';

export interface SurfacePictureResizeScope {
  readonly state: object;
  readonly selection: object;
  readonly lease: object;
  readonly source: object;
  readonly modalRevision: unknown;
  readonly legacyAvailable?: boolean;
  readonly anchoredCurrent?: () => boolean;
  readonly target: Readonly<{
    section: number;
    pictureNode: number;
    resizeRecordNode?: number;
    width: number;
    height: number;
  }>;
}
export type SurfacePictureResizeAnchor =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'center_left'
  | 'center_right'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right';
export type SurfaceAnchoredPictureRead =
  | { state: 'unavailable'; reason?: string }
  | {
      state: 'available';
      target: object;
      observation: {
        profileVersion: 1;
        format: 'hwp5' | 'hwpx';
        section: number;
        pictureNode: number;
        width: number;
        height: number;
        horizontalOffset: number;
        verticalOffset: number;
        historyRevision: number;
      };
    };
type IssuedAnchor = { scope: SurfacePictureResizeScope; target: object };
/** A certified current picture is required; hit testing alone never issues this scope. */
export function createSurfacePictureResizeControls(options: {
  canvas: HTMLCanvasElement;
  viewport: HTMLElement;
  window: Window;
  renderer: object;
  capture(): SurfacePictureResizeScope | null;
  request(width: number, height: number): boolean;
  queryAnchored?(scope: SurfacePictureResizeScope): Promise<SurfaceAnchoredPictureRead>;
  requestAnchored?(
    target: object,
    width: number,
    height: number,
    anchor: SurfacePictureResizeAnchor,
    scope: SurfacePictureResizeScope,
  ): boolean | Promise<unknown>;
  note: { textContent: string };
}) {
  const events = new AbortController();
  let shared: ReturnType<typeof createPictureResizeControls> | undefined;
  let closed = false,
    enabled = false,
    resetting = false;
  let observed: unknown;
  let down: {
    scope: SurfacePictureResizeScope;
    pointerId: number;
    anchored?: IssuedAnchor;
  } | null = null;
  let releasingAnchor: IssuedAnchor | null = null;
  let anchorQuery: {
    scope: SurfacePictureResizeScope;
    state: 'pending' | 'ready' | 'unavailable' | 'blocked';
    issued?: IssuedAnchor;
  } | null = null;
  let commitPending: object | null = null;
  let releasing: SurfacePictureResizeScope | null = null;
  const read = () => {
    if (closed || !enabled || commitPending) return null;
    try {
      return options.capture();
    } catch {
      return null;
    }
  };
  const sameScope = (next: SurfacePictureResizeScope | null, scope: SurfacePictureResizeScope) => {
    return (
      !!next &&
      next.legacyAvailable === scope.legacyAvailable &&
      next.anchoredCurrent?.() !== false &&
      scope.anchoredCurrent?.() !== false &&
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
  const current = (scope: SurfacePictureResizeScope) => sameScope(read(), scope);
  const invalidateAnchor = () => {
    anchorQuery = null;
  };
  const prefetch = (scope = read()) => {
    if (!options.queryAnchored || !options.requestAnchored || !scope) return;
    if (anchorQuery && sameScope(scope, anchorQuery.scope)) return;
    const query: NonNullable<typeof anchorQuery> = { scope, state: 'pending' };
    anchorQuery = query;
    void Promise.resolve()
      .then(() => options.queryAnchored!(scope))
      .then((answer) => {
        if (closed || anchorQuery !== query || !current(scope)) return;
        if (answer.state === 'unavailable') {
          query.state = 'unavailable';
          return;
        }
        const o = answer.observation;
        const format = (scope.state as { content?: { format?: unknown } }).content?.format;
        if (
          answer.state !== 'available' ||
          !answer.target ||
          typeof answer.target !== 'object' ||
          !o ||
          o.profileVersion !== 1 ||
          o.format !== format ||
          o.section !== scope.target.section ||
          o.pictureNode !== anchoredPictureResizeSelector(scope.target, format)?.pictureNode ||
          o.width !== scope.target.width ||
          o.height !== scope.target.height ||
          !Number.isSafeInteger(o.historyRevision) ||
          o.historyRevision < 0 ||
          ![o.horizontalOffset, o.verticalOffset].every(
            (v) => Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff,
          )
        ) {
          query.state = 'blocked';
          return;
        }
        query.issued = Object.freeze({ scope, target: answer.target });
        query.state = 'ready';
        if (!closed && scope.legacyAvailable === false)
          (options.renderer as { pictureResizeGuide?: (value: null) => void }).pictureResizeGuide?.(
            null,
          );
      })
      .catch(() => {
        if (anchorQuery === query) query.state = 'blocked';
      });
  };
  const cancel = () => {
    down = null;
    invalidateAnchor();
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
                releasingAnchor = down.anchored ?? null;
                try {
                  listener(event);
                } finally {
                  releasing = null;
                  releasingAnchor = null;
                  down = null;
                  invalidateAnchor();
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
    selected: () => {
      const scope = read();
      prefetch(scope);
      if (
        scope?.legacyAvailable === false &&
        (!anchorQuery || anchorQuery.state !== 'ready' || !sameScope(scope, anchorQuery.scope))
      )
        return null;
      return scope?.target ?? null;
    },
    anchoredResize:
      options.queryAnchored && options.requestAnchored
        ? {
            capture() {
              const scope = down?.scope;
              if (!scope || !current(scope)) return null;
              prefetch(scope);
              if (!anchorQuery || !sameScope(scope, anchorQuery.scope)) return null;
              if (anchorQuery.state === 'unavailable')
                return scope.legacyAvailable === false ? null : undefined;
              if (anchorQuery.state !== 'ready' || !anchorQuery.issued) return null;
              down!.anchored = anchorQuery.issued;
              return anchorQuery.issued;
            },
            request(
              issued: IssuedAnchor,
              width: number,
              height: number,
              anchor: SurfacePictureResizeAnchor,
            ) {
              const scope = releasing;
              if (
                !scope ||
                issued !== releasingAnchor ||
                !current(scope) ||
                !sameScope(scope, issued.scope) ||
                commitPending
              )
                return false;
              const pending = {};
              commitPending = pending;
              invalidateAnchor();
              const settled = () => {
                if (commitPending !== pending) return;
                commitPending = null;
                // A no-op or rejection may publish no new state. Restore the current
                // handle/query paint after retiring the provisional pending gate.
                if (!closed)
                  (
                    options.renderer as { pictureResizeGuide?: (value: null) => void }
                  ).pictureResizeGuide?.(null);
              };
              try {
                const result = options.requestAnchored!(
                  issued.target,
                  width,
                  height,
                  anchor,
                  scope,
                );
                if (result === false) {
                  settled();
                  return false;
                }
                void Promise.resolve(result).then(settled, () => {
                  settled();
                  if (!closed)
                    options.note.textContent = '그림 반대점 고정 크기 변경을 적용할 수 없습니다.';
                });
                return true;
              } catch {
                settled();
                return false;
              }
            },
          }
        : undefined,
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
      releasingAnchor = null;
      invalidateAnchor();
      events.abort();
      shared.close();
    },
  };
}
