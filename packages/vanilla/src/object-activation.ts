import type { StateToken } from '@hwpjs/core';
// @ts-ignore Canonical CSS/scroll/scale projection shared with direct input.
import { canvasDocumentPoint } from '../../../web/preview/canvas-pointer-coordinates.mjs';

export type CanvasObjectTarget = Readonly<
  | { kind: 'chart'; section: number; wrapper: number }
  | { kind: 'picture'; section: number; pictureNode: number }
  | { kind: 'drawing'; section: number; drawingNode: number }
>;
export interface CanvasObjectActivation {
  readonly type: 'double-click';
  readonly target: CanvasObjectTarget;
  readonly token: StateToken;
}
type PreparedObjectActivation<State> = Readonly<{
  target: CanvasObjectTarget;
  state: State;
  current(state: State): boolean;
}>;
export function bindObjectActivation<State extends { token?: StateToken }>(options: {
  canvas: HTMLCanvasElement;
  viewport: HTMLElement;
  renderer: {
    viewScale(): number;
    isPaintedFrameCurrent(): boolean;
    objectAtLogicalPoint(x: number, y: number): CanvasObjectTarget | null;
  };
  prepare?(event: MouseEvent): Promise<PreparedObjectActivation<State> | null> | undefined;
  capture(): State | undefined;
  current?(state: State): boolean;
  onError(error: unknown): void;
}) {
  const listeners = new Set<(event: CanvasObjectActivation) => void | Promise<void>>();
  let closed = false;
  const current = (state: State) => options.current?.(state) ?? options.capture() === state;
  const dispatch = (event: MouseEvent, expected?: PreparedObjectActivation<State>) => {
    if (
      closed ||
      (!expected && event.defaultPrevented) ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !listeners.size
    )
      return;
    const state = options.capture();
    if (!state || !options.renderer.isPaintedFrameCurrent()) return;
    const point = canvasDocumentPoint(
      event,
      options.canvas.getBoundingClientRect(),
      options.viewport.scrollTop,
      options.renderer.viewScale(),
      options.viewport.scrollLeft,
    );
    const target = options.renderer.objectAtLogicalPoint(point.x, point.y);
    if (!target || options.capture() !== state || !options.renderer.isPaintedFrameCurrent()) return;
    if (
      expected &&
      (expected.state !== state ||
        !expected.current(state) ||
        JSON.stringify(target) !== JSON.stringify(expected.target))
    )
      return;
    const token = state.token;
    if (!token || options.capture() !== state) return;
    const value: CanvasObjectActivation = Object.freeze({
      type: 'double-click',
      target,
      token: Object.freeze({ ...token }),
    });
    event.preventDefault();
    event.stopPropagation();
    // Snapshot registration order across reentrant subscription changes.
    for (const callback of Array.from(listeners)) {
      if (closed || !current(state)) break;
      if (!listeners.has(callback)) continue;
      const failed = (error: unknown) => {
        if (closed || !current(state)) return;
        try {
          options.onError(error);
        } catch {
          /* Error reporting cannot activate another object. */
        }
      };
      try {
        const result = callback(value);
        if (result && typeof result.then === 'function') void result.catch(failed);
      } catch (error) {
        failed(error);
      }
    }
  };
  // Installed before direct input's stale-frame gate. Only the private owned
  // selection receipt may await its first paint; all unowned events retain the
  // original bubble path and stale-frame gate. No DOM event is redispatched.
  let preparing = false;
  const prepare = (event: MouseEvent) => {
    if (
      closed ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !listeners.size
    )
      return;
    const pending = options.prepare?.(event);
    if (!pending) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (preparing) return;
    preparing = true;
    void pending
      .then((target) => {
        if (target && !closed) dispatch(event, target);
      })
      .catch((error) => {
        if (!closed) options.onError(error);
      })
      .finally(() => {
        preparing = false;
      });
  };
  const activate = (event: MouseEvent) => dispatch(event);
  options.canvas.addEventListener('dblclick', prepare, true);
  options.canvas.addEventListener('dblclick', activate);
  return {
    register(listener: (event: CanvasObjectActivation) => void | Promise<void>) {
      if (closed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (closed) return;
      closed = true;
      listeners.clear();
      options.canvas.removeEventListener('dblclick', prepare, true);
      options.canvas.removeEventListener('dblclick', activate);
    },
  };
}
