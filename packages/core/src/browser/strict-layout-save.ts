import type { HeadlessEditor, SaveResult } from '../editor/create-editor.ts';
import { strictLayoutSaveBridge, type StrictLayoutLease } from '../internal/strict-layout-save.ts';
// @ts-ignore Shared Window producer; it never creates an engine.
import { createBrowserStrictLayoutSaver } from '../../../../js/hwp5-browser-strict-layout.mjs';
// @ts-ignore Shared FontFace ownership, with the original registration-set cleanup.
import { createStrictLayoutFontOwner } from '../../../../web/preview/strict-layout-font.mjs';

export interface MeasuredPlainLayoutSaveOptions {
  readonly fontFile?: File;
  readonly allowUnprotectedOutput?: boolean;
  readonly signal?: AbortSignal;
  /** Synchronous publication after the last model/font check. */
  readonly publish: (result: SaveResult) => void;
}
/** Window owner for one existing editor; no runtime, worker or Native allocation. */
export function createMeasuredPlainLayoutSaver(editor: HeadlessEditor) {
  const bridge = strictLayoutSaveBridge(editor),
    fonts = createStrictLayoutFontOwner();
  let disposed = false,
    busy = false,
    epoch = 0;
  let documentId = editor.getEditorState().documentId;
  const unsubscribe = editor.registerStateListener((state) => {
    if (state.documentId !== documentId || state.status === 'disposed') {
      documentId = state.documentId;
      epoch++;
      fonts.clear();
    }
  });
  function clearFont() {
    epoch++;
    fonts.clear();
  }
  async function save(options: MeasuredPlainLayoutSaveOptions): Promise<SaveResult> {
    if (disposed) throw Error('StrictLayoutSaverDisposed');
    if (busy) throw Error('StrictLayoutMeasurementInProgress');
    if (typeof options?.publish !== 'function') throw Error('StrictLayoutPublicationRequired');
    const capturedEpoch = epoch;
    let lease: StrictLayoutLease | undefined;
    const check = () => {
      options.signal?.throwIfAborted();
      if (disposed || epoch !== capturedEpoch) throw Error('StrictLayoutMeasurementExpired');
      if (lease) bridge.check(lease);
    };
    const abort = () => {
      if (lease) void bridge.cancel(lease).catch(() => {});
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    busy = true;
    let failure: unknown,
      failed = false,
      result: SaveResult | undefined;
    try {
      check();
      lease = await bridge.prepare({
        allowUnprotectedOutput: options.allowUnprotectedOutput === true,
        signal: options.signal,
      });
      check();
      const owned = lease;
      const font = await fonts.acquire(owned.snapshot, options.fontFile, check);
      check();
      const produce = createBrowserStrictLayoutSaver({
        prepare: () => owned.snapshot,
        check,
        commit: (lines: unknown) => bridge.commit(owned, lines),
        cancel: () => bridge.cancel(owned),
        publish: (result: SaveResult) => bridge.publish(owned, result, options.publish),
      });
      result = await produce({ fontFace: font.face });
    } catch (error) {
      failed = true;
      failure = error;
    }
    try {
      if (lease) await bridge.cancel(lease);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    } finally {
      if (lease) bridge.finish(lease);
      options.signal?.removeEventListener('abort', abort);
      busy = false;
    }
    if (failed) throw failure;
    if (!result) throw Error('InvalidStrictMeasuredSave');
    return result;
  }
  return Object.freeze({
    available: () => !disposed && !busy && bridge.available(),
    save,
    clearFont,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearFont();
      unsubscribe();
    },
  });
}
