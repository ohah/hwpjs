import type { CreateEditorOptions, HeadlessEditor } from '@hwpjs/core';
import type { NativeProvider } from './provider.ts';

// Derive host contracts from the public editor to avoid a second host protocol.
export type NativeInputHooks = Parameters<HeadlessEditor['acquireInputSurface']>[0];
export type NativeInputLease = ReturnType<HeadlessEditor['acquireInputSurface']>;
export interface NativeController {
  readonly editor: HeadlessEditor;
  attachInputSurface(hooks: NativeInputHooks): NativeInputLease;
  detachInputSurface(): void;
  dispose(): Promise<void>;
}
function controller(editor: HeadlessEditor, ownsEditor: boolean): NativeController {
  let terminal = false, lease: NativeInputLease | undefined, disposal: Promise<void> | undefined;
  return Object.freeze({
    editor,
    attachInputSurface(hooks: NativeInputHooks): NativeInputLease {
      if (terminal) throw Error('NativeControllerDisposed');
      if (lease?.isActive()) throw Error('NativeInputSurfaceAlreadyAttached');
      lease = editor.acquireInputSurface(hooks);
      return lease;
    },
    detachInputSurface(): void {
      const previous = lease;
      lease = undefined;
      previous?.release();
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      terminal = true;
      let resolve!: () => void, reject!: (error: unknown) => void;
      disposal = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
      const failures: unknown[] = [];
      // Fence an owned core editor synchronously, before invoking input callbacks.
      // External editors always remain owned by their caller.
      let editorDisposal: void | Promise<void> = undefined;
      try { if (ownsEditor) editorDisposal = editor.dispose(); } catch (error) { failures.push(error); }
      try { const previous = lease; lease = undefined; previous?.release(); } catch (error) { failures.push(error); }
      void Promise.resolve(editorDisposal).catch(error => { failures.push(error); }).then(() => {
        if (failures.length) throw new AggregateError(failures, 'NativeControllerDisposeFailed');
      }).then(resolve, reject);
      return disposal;
    },
  });
}
/** Attaches to an externally owned core editor. Disposing never disposes it. */
export function createNativeController(editor: HeadlessEditor): NativeController {
  return controller(editor, false);
}
/** Only this factory owns the editor it creates and releases it on disposal. */
export function createNativeEditorController(provider: NativeProvider, options?: Omit<CreateEditorOptions, 'runtimeFactory'>): NativeController {
  return controller(provider.createEditor(options), true);
}
