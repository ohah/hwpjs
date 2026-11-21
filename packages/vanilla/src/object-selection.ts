import { createDrawingObservationQuery } from '../../../web/preview/drawing-observation.mjs';
import type { StateToken } from '@hwpjs/core';
import type { CanvasObjectTarget } from './object-activation.ts';
// @ts-ignore Shared current Native read-only membership.
import { currentHwp5ChartTarget } from '../../../web/preview/hwp5-chart-resources.mjs';

export interface ObjectSelectionState {
  readonly token: StateToken;
  readonly stateVersion: number;
  readonly selection?: unknown;
}
/** Private host witness. Never exposed as edit, resize, save or Native authority. */
export interface ObjectSelectionScene<State extends ObjectSelectionState> {
  readonly state: State;
  readonly lease: object;
  readonly frame: object;
  readonly source: object;
  readonly modalRevision: number;
}
export interface CanvasSelectedObject {
  readonly target: CanvasObjectTarget;
  readonly token: StateToken;
}
export interface CanvasObjectPropertiesRequest extends CanvasSelectedObject {
  readonly type: 'properties-shortcut' | 'properties-command';
}
export interface ObjectSelectionPointer {
  readonly trusted: boolean;
  readonly onCanvas: boolean;
  readonly pointerId: number;
  readonly button: number;
  readonly primary: boolean;
  readonly defaultPrevented?: boolean;
  readonly x: number;
  readonly y: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
}
export interface ObjectPropertiesKey {
  readonly trusted: boolean;
  readonly onCanvas: boolean;
  readonly key: string;
  readonly keyCode?: number;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly defaultPrevented?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altGraph?: boolean;
}
const keys = ['editorId', 'documentId', 'generation', 'operationRevision', 'viewRevision'] as const;
const uint = (n: unknown): n is number =>
  Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 0xffffffff;
const equalTarget = (a: CanvasObjectTarget | null, b: CanvasObjectTarget | null) =>
  !!a &&
  !!b &&
  a.kind === b.kind &&
  a.section === b.section &&
  (a.kind === 'chart' && b.kind === 'chart'
    ? a.wrapper === b.wrapper
    : a.kind === 'hwp5-chart' && b.kind === 'hwp5-chart'
      ? a.controlNode === b.controlNode
      : a.kind === 'picture' && b.kind === 'picture'
        ? a.pictureNode === b.pictureNode
        : a.kind === 'drawing' && b.kind === 'drawing' && a.drawingNode === b.drawingNode);
function ownTarget(value: CanvasObjectTarget | null): CanvasObjectTarget | null {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(d).length !== 3 ||
    !d.kind ||
    !('value' in d.kind) ||
    !d.section ||
    !('value' in d.section) ||
    !uint(d.section.value)
  )
    return null;
  const field =
    d.kind.value === 'chart'
      ? 'wrapper'
      : d.kind.value === 'hwp5-chart'
        ? 'controlNode'
        : d.kind.value === 'picture'
          ? 'pictureNode'
          : d.kind.value === 'drawing'
            ? 'drawingNode'
            : null;
  if (!field || !d[field] || !('value' in d[field]) || !uint(d[field].value)) return null;
  return Object.freeze({
    kind: d.kind.value,
    section: d.section.value,
    [field]: d[field].value,
  }) as CanvasObjectTarget;
}
/** Native metadata membership only; this deliberately issues no editable target. */
export function objectSelectionOwner(source: any, target: CanvasObjectTarget): boolean {
  if (target.kind === 'hwp5-chart') return currentHwp5ChartTarget(source, target) !== null;
  if (target.kind === 'drawing') {
    const observed = createDrawingObservationQuery(source).get(target.section, target.drawingNode);
    const row = observed?.row as any;
    return (
      !!row &&
      !row.error &&
      !row.error_name &&
      !row.sourceError &&
      observed?.activationSafe === true
    );
  }
  const [rows, field] =
    target.kind === 'chart' ? [source?.chartTargets, 'wrapper'] : [source?.pictures, 'pictureNode'];
  if (!Array.isArray(rows)) return false;
  const matches = rows.filter(
    (r: any) => r?.section === target.section && r?.[field] === (target as any)[field],
  );
  if (matches.length !== 1 || matches[0].error || matches[0].error_name || matches[0].sourceError)
    return false;
  const row = matches[0];
  if (target.kind === 'picture')
    return row.state === 'located' || row.state === 'reference_located';
  const oles = (Array.isArray(source.oles) ? source.oles : []).filter(
    (r: any) => r?.section === target.section && r?.chartWrapper === target.wrapper,
  );
  const paragraphs = (Array.isArray(source.paragraphs) ? source.paragraphs : []).filter(
    (r: any) => r?.section === target.section && r?.paragraph === row.paragraph,
  );
  return (
    uint(row.paragraph) &&
    uint(row.anchorUnit) &&
    paragraphs.length === 1 &&
    !paragraphs[0].clipped &&
    paragraphs[0].text?.[row.anchorUnit] === '\ufffc' &&
    oles.length === 1 &&
    oles[0].state === 'located' &&
    !oles[0].error &&
    !oles[0].sourceError &&
    oles[0].representation === 'chart-alternative' &&
    row.paragraph === oles[0].paragraph &&
    row.anchorUnit === oles[0].anchorUnit
  );
}

/** Completed pointer gesture -> host commit receipt -> object mode -> focused P.
 * A hit, token-shaped object, external selection or programmatic focus cannot select.
 */
export function createObjectSelection<State extends ObjectSelectionState>(options: {
  capture(): ObjectSelectionScene<State> | null;
  hit(scene: ObjectSelectionScene<State>, x: number, y: number): CanvasObjectTarget | null;
  /** Explicit one-shot behind-text selection only; default text hit preference is unchanged. */
  behindTextHit?(
    scene: ObjectSelectionScene<State>,
    x: number,
    y: number,
  ): CanvasObjectTarget | null;
  pendingBehindTextHit?(
    scene: ObjectSelectionScene<State>,
    x: number,
    y: number,
  ): CanvasObjectTarget | null;
  /** Original-frame query for a pending second gesture; intent only, never confirmation. */
  pendingHit?(scene: ObjectSelectionScene<State>, x: number, y: number): CanvasObjectTarget | null;
  /** Mode intent only: accept a completed repaint certified to preserve the same scene. */
  acknowledgeArmedPaint?(
    previous: ObjectSelectionScene<State>,
    next: ObjectSelectionScene<State>,
  ): boolean;
  /** Private completed-paint acknowledgement; never used for pointer intent or commit confirmation. */
  acknowledgePaint?(
    previous: ObjectSelectionScene<State>,
    next: ObjectSelectionScene<State>,
    target: CanvasObjectTarget,
  ): boolean;
  hostFocused(): boolean;
  commit(request: {
    readonly scene: ObjectSelectionScene<State>;
    readonly target: CanvasObjectTarget;
    readonly x: number;
    readonly y: number;
    readonly behindTextOnly: boolean;
    current(): boolean;
    confirm(scene: ObjectSelectionScene<State>): object | null;
  }): Promise<object | null>;
  onClear?(): void;
  /** Presentation notification only; observers receive no selection or mutation authority. */
  onChange?(): void;
  onError(error: unknown): void;
}) {
  type Selected = { scene: ObjectSelectionScene<State>; value: CanvasSelectedObject };
  type Candidate = {
    scene: ObjectSelectionScene<State>;
    token: StateToken;
    target: CanvasObjectTarget;
    pointer: ObjectSelectionPointer;
    behindTextOnly: boolean;
    reuse: Selected | null;
  };
  let armedBehind: { scene: ObjectSelectionScene<State>; token: StateToken } | null = null;
  let closed = false,
    epoch = 0,
    down: Candidate | null = null,
    committing: Candidate | null = null,
    commitBusy = false;
  let pendingDone: Promise<void> | null = null,
    finishPending: (() => void) | null = null,
    continuation: ObjectSelectionPointer | null = null;
  let observed: State | null = null,
    selected: Selected | null = null;
  let owner: { callback: (event: CanvasObjectPropertiesRequest) => void | Promise<void> } | null =
      null,
    dispatching = false;
  const sameToken = (a: StateToken, b: StateToken) => keys.every((k) => a[k] === b[k]);
  const sceneEqual = (a: ObjectSelectionScene<State>, b: ObjectSelectionScene<State>) =>
    a.state === b.state &&
    a.lease === b.lease &&
    a.frame === b.frame &&
    a.source === b.source &&
    a.modalRevision === b.modalRevision;
  const safeCapture = () => {
    try {
      return closed ? null : options.capture();
    } catch {
      return null;
    }
  };
  const exactCurrent = (scene: ObjectSelectionScene<State>, token: StateToken) => {
    const now = safeCapture();
    return !!now && sceneEqual(scene, now) && sameToken(now.state.token, token);
  };
  const clear = (_reason?: string) => {
    const changed = selected !== null;
    epoch++;
    down = committing = observed = selected = null;
    armedBehind = null;
    continuation = null;
    finishPending?.();
    if (_reason !== 'pointerdown') options.onClear?.();
    if (changed) options.onChange?.();
  };
  const failure = (error: unknown) => {
    try {
      options.onError(error);
    } catch {
      /* Reporting is not selection admission. */
    }
  };
  const validPointer = (e: ObjectSelectionPointer) =>
    e.trusted &&
    e.onCanvas &&
    e.primary &&
    !e.defaultPrevented &&
    e.button === 0 &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.shiftKey &&
    [e.x, e.y, e.clientX, e.clientY].every(Number.isFinite) &&
    Number.isInteger(e.pointerId);
  const hit = (
    scene: ObjectSelectionScene<State>,
    x: number,
    y: number,
    behindTextOnly = false,
  ) => {
    try {
      const target = ownTarget(
        behindTextOnly ? (options.behindTextHit?.(scene, x, y) ?? null) : options.hit(scene, x, y),
      );
      if (behindTextOnly) {
        const source = scene.source as any;
        if (
          source?.format !== 'hwpx' ||
          target?.kind !== 'drawing' ||
          !Array.isArray(source.drawings) ||
          !source.drawings.some(
            (r: any) =>
              r.section === target.section &&
              r.drawingNode === target.drawingNode &&
              r.source?.flow?.text_wrap === 2,
          )
        )
          return null;
      }
      return target && objectSelectionOwner(scene.source, target) ? target : null;
    } catch {
      return null;
    }
  };
  const pendingHit = (candidate: Candidate, event: ObjectSelectionPointer) => {
    const ticket = epoch;
    try {
      const pending = candidate.behindTextOnly ? options.pendingBehindTextHit : options.pendingHit;
      const target = pending
        ? ownTarget(pending(candidate.scene, event.x, event.y))
        : event.x === candidate.pointer.x && event.y === candidate.pointer.y
          ? candidate.target
          : null;
      return ticket === epoch && committing === candidate && equalTarget(target, candidate.target);
    } catch {
      return false;
    }
  };
  function current(): CanvasSelectedObject | null {
    const saved = selected,
      ticket = epoch;
    if (!saved) return null;
    try {
      const next = safeCapture();
      const sameContext =
        !!next &&
        saved.scene.state === next.state &&
        saved.scene.lease === next.lease &&
        saved.scene.source === next.source &&
        saved.scene.modalRevision === next.modalRevision &&
        sameToken(next.state.token, saved.value.token);
      if (
        !sameContext ||
        !objectSelectionOwner(next.source, saved.value.target) ||
        selected !== saved ||
        ticket !== epoch
      ) {
        clear('scene');
        return null;
      }
      const sameRawFrame = saved.scene.frame === next.frame;
      if (!sameRawFrame && !options.acknowledgePaint) {
        clear('frame');
        return null;
      }
      if (
        options.acknowledgePaint &&
        (!options.hostFocused() ||
          !options.acknowledgePaint(saved.scene, next, saved.value.target) ||
          ticket !== epoch ||
          selected !== saved ||
          !exactCurrent(next, saved.value.token) ||
          !options.hostFocused() ||
          ticket !== epoch)
      ) {
        clear('paint');
        return null;
      }
      if (!sameRawFrame) saved.scene = Object.freeze({ ...next });
      return selected === saved && ticket === epoch ? saved.value : null;
    } catch {
      clear('scene');
      return null;
    }
  }

  function requestProperties(type: CanvasObjectPropertiesRequest['type']): boolean {
    if (closed || dispatching || !owner || down || committing || continuation) return false;
    const value = current(),
      saved = selected,
      callback = owner;
    if (closed || dispatching || !callback) return false;
    if (!value || !saved || !options.hostFocused()) {
      clear('focus');
      return false;
    }
    clear('properties');
    const propertiesTicket = epoch,
      focused = options.hostFocused();
    const nativeCurrent = exactCurrent(saved.scene, value.token);
    if (!focused || !nativeCurrent || closed || epoch !== propertiesTicket || owner !== callback)
      return false;
    const request = Object.freeze({ type, ...value });
    dispatching = true;
    try {
      const result = callback.callback(request);
      if (result && typeof result.then === 'function') {
        void result
          .catch((error) => {
            if (!closed && exactCurrent(saved.scene, value.token)) failure(error);
          })
          .finally(() => {
            dispatching = false;
          });
      } else dispatching = false;
    } catch (error) {
      dispatching = false;
      if (!closed && exactCurrent(saved.scene, value.token)) failure(error);
    }
    return true;
  }

  return {
    armBehindTextSelection(): boolean {
      if (
        closed ||
        commitBusy ||
        down ||
        dispatching ||
        typeof options.behindTextHit !== 'function'
      )
        return false;
      const scene = safeCapture();
      const source = scene?.source as any;
      if (!scene || !options.hostFocused() || source?.format !== 'hwpx' || source.readOnly === true)
        return false;
      const token = Object.freeze({ ...scene.state.token });
      if (!exactCurrent(scene, token)) return false;
      armedBehind = { scene: Object.freeze({ ...scene }), token };
      return true;
    },
    quarantinePendingKey(event: ObjectPropertiesKey): boolean {
      // Pending intent is not selected-object mode. Quarantine only its own
      // unmodified printable P before direct input can type into the old caret.
      return (
        !closed &&
        !!(down || committing || continuation) &&
        event.trusted &&
        !event.defaultPrevented &&
        event.key.toLowerCase() === 'p' &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      );
    },
    pendingInput: () => !closed && !!(down || committing || continuation),
    prepareDoubleClick(event: { trusted: boolean; x: number; y: number }):
      | Promise<Readonly<{
          target: CanvasObjectTarget;
          state: State;
          current(state: State): boolean;
        }> | null>
      | undefined {
      if (!event.trusted || ![event.x, event.y].every(Number.isFinite)) return undefined;
      const candidate = committing;
      const value = candidate ? null : current();
      if (!candidate && !value) return undefined;
      const ticket = epoch,
        wait = pendingDone;
      const target = candidate?.target ?? value!.target;
      return Promise.resolve(wait).then(() => {
        const value = current(),
          scene = safeCapture();
        if (
          ticket !== epoch ||
          !value ||
          !scene ||
          !options.hostFocused() ||
          !equalTarget(target, value.target) ||
          !equalTarget(hit(scene, event.x, event.y), target)
        )
          return null;
        return Object.freeze({
          target: value.target,
          state: scene.state,
          current(state: State) {
            return (
              ticket === epoch &&
              state === scene.state &&
              selected?.value === value &&
              current() === value &&
              options.hostFocused() &&
              ticket === epoch
            );
          },
        });
      });
    },
    pointerDown(event: ObjectSelectionPointer): boolean {
      if (
        commitBusy &&
        committing &&
        validPointer(event) &&
        Math.hypot(
          event.clientX - committing.pointer.clientX,
          event.clientY - committing.pointer.clientY,
        ) <= 4 &&
        pendingHit(committing, event)
      ) {
        // Own the second gesture only; it cannot commit or grant selection. The original
        // receipt and a fresh post-settle hit still decide dblclick admission.
        continuation = { ...event };
        return true;
      }
      const armed = armedBehind;
      const reusable = current() ? selected : null,
        blocked = commitBusy;
      clear('pointerdown');
      if (closed || blocked || dispatching || !validPointer(event)) return false;
      const scene = safeCapture();
      if (
        !scene ||
        (armed &&
          (!options.hostFocused() ||
            armed.scene.state !== scene.state ||
            armed.scene.lease !== scene.lease ||
            armed.scene.source !== scene.source ||
            armed.scene.modalRevision !== scene.modalRevision ||
            (armed.scene.frame !== scene.frame &&
              options.acknowledgeArmedPaint?.(armed.scene, scene) !== true) ||
            !sameToken(armed.token, scene.state.token)))
      )
        return false;
      const token = Object.freeze({ ...scene.state.token }),
        target = hit(scene, event.x, event.y, !!armed);
      if (!target || !exactCurrent(scene, token)) return false;
      down = {
        scene: Object.freeze({ ...scene }),
        token,
        target,
        pointer: { ...event },
        behindTextOnly: !!armed,
        reuse:
          reusable &&
          sceneEqual(scene, reusable.scene) &&
          equalTarget(target, reusable.value.target)
            ? reusable
            : null,
      };
      return true; // Intent captured only. Surface consumes this gesture, no selection yet.
    },
    pointerMove(event: Pick<ObjectSelectionPointer, 'pointerId' | 'clientX' | 'clientY'>) {
      if (
        continuation &&
        (event.pointerId !== continuation.pointerId ||
          Math.hypot(event.clientX - continuation.clientX, event.clientY - continuation.clientY) >
            4)
      )
        clear('drag');
      if (
        down &&
        (event.pointerId !== down.pointer.pointerId ||
          ![event.clientX, event.clientY].every(Number.isFinite) ||
          Math.hypot(event.clientX - down.pointer.clientX, event.clientY - down.pointer.clientY) >
            4)
      )
        clear('drag');
    },
    async pointerUp(event: ObjectSelectionPointer): Promise<void> {
      if (continuation) {
        const second = continuation;
        continuation = null;
        if (
          !validPointer(event) ||
          second.pointerId !== event.pointerId ||
          Math.hypot(event.clientX - second.clientX, event.clientY - second.clientY) > 4
        )
          clear('second-up');
        return;
      }
      const candidate = down;
      down = null;
      if (
        !candidate ||
        closed ||
        !validPointer(event) ||
        candidate.pointer.pointerId !== event.pointerId ||
        Math.hypot(
          event.clientX - candidate.pointer.clientX,
          event.clientY - candidate.pointer.clientY,
        ) > 4 ||
        !exactCurrent(candidate.scene, candidate.token) ||
        !equalTarget(
          hit(candidate.scene, event.x, event.y, candidate.behindTextOnly),
          candidate.target,
        )
      ) {
        clear('pointerup');
        return;
      }
      const reuse = candidate.reuse,
        reuseEpoch = epoch;
      if (
        reuse &&
        options.hostFocused() &&
        reuseEpoch === epoch &&
        exactCurrent(reuse.scene, reuse.value.token)
      ) {
        // Re-clicking an already certified object does not clear/repaint again.
        // In particular the second click must not create a new Core clear before dblclick.
        if (reuseEpoch === epoch) {
          selected = reuse;
          options.onChange?.();
        }
        return;
      }
      const ticket = ++epoch,
        receipts = new WeakMap<object, ObjectSelectionScene<State>>();
      committing = candidate;
      observed = null;
      commitBusy = true;
      pendingDone = new Promise<void>((resolve) => {
        finishPending = resolve;
      });
      try {
        const receipt = await options.commit({
          scene: candidate.scene,
          target: candidate.target,
          x: event.x,
          y: event.y,
          behindTextOnly: candidate.behindTextOnly,
          current: () =>
            !closed && ticket === epoch && exactCurrent(candidate.scene, candidate.token),
          confirm(scene) {
            if (
              closed ||
              ticket !== epoch ||
              committing !== candidate ||
              observed !== scene.state ||
              scene.state.stateVersion !== candidate.scene.state.stateVersion + 1 ||
              scene.state.selection !== null ||
              scene.lease !== candidate.scene.lease ||
              scene.source !== candidate.scene.source ||
              scene.modalRevision !== candidate.scene.modalRevision ||
              scene.frame === candidate.scene.frame ||
              !sameToken(scene.state.token, candidate.token) ||
              !exactCurrent(scene, candidate.token) ||
              !equalTarget(hit(scene, event.x, event.y, candidate.behindTextOnly), candidate.target)
            )
              return null;
            const result = Object.freeze({});
            receipts.set(result, Object.freeze({ ...scene }));
            return result;
          },
        });
        const scene = receipt && receipts.get(receipt);
        if (
          !scene ||
          closed ||
          ticket !== epoch ||
          !exactCurrent(scene, candidate.token) ||
          !options.hostFocused() ||
          closed ||
          ticket !== epoch ||
          !exactCurrent(scene, candidate.token)
        )
          return;
        selected = {
          scene,
          value: Object.freeze({ target: candidate.target, token: candidate.token }),
        };
        options.onChange?.();
      } catch (error) {
        if (!closed && ticket === epoch) failure(error);
      } finally {
        commitBusy = false;
        finishPending?.();
        finishPending = null;
        pendingDone = null;
        if (!selected) options.onClear?.();
        if (ticket === epoch) {
          committing = null;
          observed = null;
        }
      }
    },
    observeState(state: State) {
      if (closed) return;
      if (armedBehind && state !== armedBehind.scene.state) clear('armed-state');
      if (committing && observed && state === committing.scene.state) {
        clear('rollback');
        return;
      }
      if (committing && state !== committing.scene.state) {
        if (observed && observed !== state) {
          clear('extra-state');
          return;
        }
        if (
          state.stateVersion !== committing.scene.state.stateVersion + 1 ||
          state.selection !== null ||
          !sameToken(state.token, committing.token)
        ) {
          clear('state');
          return;
        }
        observed = state;
        return; // Only the exact returned lease.publishSelection(null) receipt may confirm this one state.
      }
      if ((selected && state !== selected.scene.state) || (down && state !== down.scene.state))
        clear('state');
    },
    current,
    clear,
    keyDown(event: ObjectPropertiesKey): boolean {
      const key = event.key.toLowerCase();
      if (event.isComposing || event.keyCode === 229) {
        clear('composition');
        return false;
      }
      if (
        key === 'shift' &&
        event.trusted &&
        event.onCanvas &&
        current()?.target.kind === 'picture'
      )
        return false;
      if (key !== 'p') {
        clear('key');
        return false;
      }
      if (
        closed ||
        !event.trusted ||
        !event.onCanvas ||
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.altGraph === true ||
        event.shiftKey ||
        dispatching ||
        !owner
      )
        return false;
      return requestProperties('properties-shortcut');
    },
    requestProperties: () => requestProperties('properties-command'),
    registerPropertiesRequest(
      callback: (event: CanvasObjectPropertiesRequest) => void | Promise<void>,
    ) {
      if (closed) return () => {};
      if (owner) throw Error('ObjectPropertiesOwnerAlreadyAttached');
      const record = { callback };
      owner = record;
      return () => {
        if (owner === record) owner = null;
      };
    },
    dispose() {
      if (closed) return;
      closed = true;
      clear('dispose');
      owner = null;
    },
  };
}

/** Thin DOM transport. All decisions remain in the private selection owner. */
export function bindObjectSelectionEvents<State extends ObjectSelectionState>(options: {
  canvas: HTMLCanvasElement;
  input: HTMLInputElement | HTMLTextAreaElement;
  viewport: HTMLElement;
  document: Document;
  selection: ReturnType<typeof createObjectSelection<State>>;
  point(event: PointerEvent): { x: number; y: number };
  retainPropertiesControl?(event: PointerEvent): boolean;
}) {
  const removals: (() => void)[] = [];
  let claimed: number | null = null;
  const listen = (node: EventTarget, type: string, handler: (event: any) => void) => {
    node.addEventListener(type, handler, true);
    removals.push(() => node.removeEventListener(type, handler, true));
  };
  const clear = (reason: string) => {
    claimed = null;
    options.selection.clear(reason);
  };
  const origin = (event: Event) => event.composedPath?.()[0] ?? event.target;
  const pointer = (event: PointerEvent): ObjectSelectionPointer => ({
    ...options.point(event),
    trusted: event.isTrusted,
    onCanvas: origin(event) === options.canvas,
    primary: event.isPrimary,
    pointerId: event.pointerId,
    button: event.button,
    defaultPrevented: event.defaultPrevented,
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  });
  listen(options.document, 'pointerdown', (event: PointerEvent) => {
    if (origin(event) !== options.canvas) {
      if (options.retainPropertiesControl?.(event)) return;
      clear('outside-pointer');
    }
  });
  listen(options.canvas, 'pointerdown', (event: PointerEvent) => {
    claimed = options.selection.pointerDown(pointer(event)) ? event.pointerId : null;
    if (claimed !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
  listen(options.document, 'pointermove', (event: PointerEvent) =>
    options.selection.pointerMove(event),
  );
  listen(options.document, 'pointerup', (event: PointerEvent) => {
    if (claimed === null) return;
    const ours = claimed === event.pointerId && origin(event) === options.canvas;
    claimed = null;
    if (!ours) {
      clear('outside-up');
      return;
    }
    const input = pointer(event);
    event.preventDefault();
    event.stopImmediatePropagation();
    // Preserve earlier cancellation; only our own preventDefault is excluded.
    void options.selection.pointerUp(input);
  });
  listen(options.document, 'pointercancel', () => clear('pointer-cancel'));
  listen(options.document, 'focusin', (event: FocusEvent) => {
    if (origin(event) !== options.canvas) clear('focus');
  });
  const keydown = (event: KeyboardEvent) => {
    const onCanvas = origin(event) === options.canvas;
    const ours = onCanvas || origin(event) === options.input;
    const key = {
      ...event,
      trusted: event.isTrusted,
      onCanvas,
      key: event.key,
      keyCode: event.keyCode,
      defaultPrevented: event.defaultPrevented,
      repeat: event.repeat,
      isComposing: event.isComposing,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    };
    if (ours && options.selection.quarantinePendingKey(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (
      options.selection.keyDown({
        trusted: event.isTrusted,
        onCanvas: origin(event) === options.canvas,
        key: event.key,
        keyCode: event.keyCode,
        repeat: event.repeat,
        isComposing: event.isComposing,
        defaultPrevented: event.defaultPrevented,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        altGraph: event.getModifierState?.('AltGraph') === true,
        shiftKey: event.shiftKey,
      })
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  listen(options.canvas, 'keydown', keydown);
  listen(options.input, 'keydown', keydown);
  // The old textarea can retain focus between down and the asynchronous clear.
  // Its beforeinput is never admitted while this host owns an unresolved intent.
  listen(options.document, 'beforeinput', (event: InputEvent) => {
    if (origin(event) === options.input && options.selection.pendingInput()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clear('pending-beforeinput');
    }
  });
  for (const type of ['beforeinput', 'input', 'compositionstart', 'compositionend', 'paste', 'cut'])
    listen(options.document, type, () => clear(type));
  listen(options.document, 'selectionchange', () => {
    const value = options.document.getSelection?.();
    if (value && !value.isCollapsed) clear('dom-text-selection');
  });
  listen(options.document, 'beforetoggle', (event: Event) => {
    if ((event.target as Element)?.tagName === 'DIALOG') clear('modal');
  });
  listen(options.viewport, 'scroll', (event: Event) => {
    // The hidden input can scroll itself while its committed text is reset.
    if (event.target === options.viewport) clear('scroll');
  });
  const view = options.document.defaultView;
  if (view)
    listen(view, 'blur', (event: FocusEvent) => {
      // Capture also sees descendant blur during our own input-to-canvas handoff.
      if (event.target === view) clear('window-blur');
    });
  return () => {
    clear('detach');
    for (const remove of removals.splice(0)) remove();
  };
}
