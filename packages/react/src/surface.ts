import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import type { HeadlessEditor } from '@hwpjs/core';
import { createCanvasSurface } from '@hwpjs/vanilla';

export type CanvasSurfaceInstance = ReturnType<typeof createCanvasSurface>;
export type CanvasSurfaceEnvironment = Parameters<typeof createCanvasSurface>[0]['environment'];
export interface UseCanvasSurfaceOptions {
  /** Externally owned. This adapter never loads, replaces or disposes it. */
  editor: HeadlessEditor;
  /** Identity change replaces the host. Memoize an environment object. */
  environment?: CanvasSurfaceEnvironment;
  onStatus?: (message: string) => void | Promise<void>;
  /** Once per successful effect setup; callback-only updates do not remount. */
  onReady?: (surface: CanvasSurfaceInstance) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}
export interface CanvasSurfaceHandle {
  readonly element: HTMLElement | null;
  readonly surface: CanvasSurfaceInstance | null;
  focus(): boolean;
  setScale(value: number): boolean;
  getSelection(): ReturnType<CanvasSurfaceInstance['getSelection']>;
  flushComposition(): ReturnType<CanvasSurfaceInstance['flushComposition']>;
}

/** Client mount boundary only. Every effect setup constructs a fresh surface.
 * Late callbacks are fenced to their root and lease; editor ownership remains
 * outside React. No browser objects are accessed while importing/rendering.
 */
export function useCanvasSurface(options: UseCanvasSurfaceOptions) {
  const { editor, environment } = options;
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<CanvasSurfaceInstance | null>(null);
  const disposal = useRef<Promise<void> | null>(null);
  const failedDisposal = useRef(false);
  const callbacks = useRef(options);
  // Update only on commit, so an aborted concurrent render cannot replace the
  // active surface's callbacks. This effect precedes the surface setup effect.
  useEffect(() => {
    callbacks.current = options;
  });
  const mountRef = useCallback((node: HTMLElement | null) => {
    if (rootRef.current !== node) surfaceRef.current = null;
    rootRef.current = node;
    setRoot(node);
  }, []);
  const handle = useMemo<CanvasSurfaceHandle>(
    () => ({
      get element() {
        return rootRef.current;
      },
      get surface() {
        return surfaceRef.current;
      },
      focus() {
        return surfaceRef.current?.focus() ?? false;
      },
      setScale(value) {
        return surfaceRef.current?.setScale(value) ?? false;
      },
      getSelection() {
        return surfaceRef.current?.getSelection() ?? null;
      },
      flushComposition() {
        return surfaceRef.current?.flushComposition() ?? Promise.resolve('blocked' as const);
      },
    }),
    [],
  );
  useEffect(() => {
    if (!root) return;
    let live = true;
    let surface: CanvasSurfaceInstance | null = null;
    const current = () => live && rootRef.current === root;
    const report = (error: unknown) => {
      if (!current()) return;
      try {
        if (callbacks.current.onError)
          void Promise.resolve(callbacks.current.onError(error)).catch(() => {});
        else console.error(error);
      } catch {
        /* Error reporters cannot break lease cleanup or recurse. */
      }
    };
    const dispose = () => {
      // Surface.dispose releases its lease synchronously before returning its
      // flush Promise. It must not dispose the externally supplied editor.
      const owned = surface;
      surface = null;
      if (surfaceRef.current === owned) surfaceRef.current = null;
      if (!owned) return;
      let pending: Promise<void>;
      try {
        pending = Promise.resolve(owned.dispose());
      } catch (error) {
        pending = Promise.reject(error);
      }
      disposal.current = pending;
      // Observe rejection even when no replacement follows. Detached native
      // request errors remain observable through the editor's error channel.
      const clear = () => {
        if (disposal.current === pending) disposal.current = null;
      };
      void pending.then(clear, () => {
        failedDisposal.current = true;
        clear();
      });
    };
    const start = () => {
      if (!current()) return;
      if (failedDisposal.current) {
        report(Error('CanvasSurfaceDisposalFailed'));
        return;
      }
      try {
        surface = createCanvasSurface({
          root,
          editor,
          environment,
          onStatus(message) {
            if (!current()) return;
            try {
              void Promise.resolve(callbacks.current.onStatus?.(message)).catch(report);
            } catch (error) {
              report(error);
            }
          },
        });
        if (current()) {
          surfaceRef.current = surface;
          const ready = callbacks.current.onReady?.(surface);
          if (ready)
            void Promise.resolve(ready).catch((error) => {
              if (current()) {
                dispose();
                report(error);
                live = false;
              }
            });
        } else dispose();
      } catch (error) {
        dispose();
        report(error);
        live = false;
      }
    };
    // A prior lease's synchronous teardown is not its full in-flight drain.
    // Do not attach the replacement until the public dispose Promise settles.
    const previous = disposal.current;
    if (previous) void previous.then(start, report);
    else start();
    return () => {
      live = false;
      dispose();
    };
  }, [root, editor, environment]);
  return { mountRef, handle };
}

export interface CanvasSurfaceProps
  extends
    UseCanvasSurfaceOptions,
    Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'dangerouslySetInnerHTML' | 'onError'> {}

/** React owns this one empty host div; vanilla exclusively owns its descendants.
 * ref is an imperative surface handle, not the externally owned editor.
 */
export const CanvasSurface = forwardRef<CanvasSurfaceHandle, CanvasSurfaceProps>(
  function CanvasSurface(
    { editor, environment, onStatus, onReady, onError, style, ...attributes },
    ref,
  ) {
    const { mountRef, handle } = useCanvasSurface({
      editor,
      environment,
      onStatus,
      onReady,
      onError,
    });
    useImperativeHandle(ref, () => handle, [handle]);
    // TypeScript excludes these, but JS consumers must not insert React-owned
    // children or HTML into vanilla's exclusively owned host subtree either.
    Reflect.deleteProperty(attributes, 'children');
    Reflect.deleteProperty(attributes, 'dangerouslySetInnerHTML');
    return createElement('div', {
      ...attributes,
      ref: mountRef,
      'data-hwpjs-react-surface': '',
      style: { ...style, height: '100%', minHeight: 0 },
    });
  },
);
CanvasSurface.displayName = 'CanvasSurface';

/** Observations only: getEditorState has stable identity at an unchanged version.
 * The same snapshot getter supplies SSR and hydration's server snapshot.
 */
export function useEditorState(editor: HeadlessEditor) {
  const subscribe = useCallback(
    (notify: () => void) => editor.registerStateListener(() => notify()),
    [editor],
  );
  const getSnapshot = useCallback(() => editor.getEditorState(), [editor]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
