import type { HeadlessEditor } from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
import { createPictureCropPort } from './picture-crop-port.ts';
import { createPictureCropForm } from './picture-crop-form.ts';
import { createObjectPropertiesEditGate } from './object-properties-edit-gate.ts';
import type { PictureReplacementHost } from './picture-replacement-port.ts';
/** Crop-only fallback. Never requires resize geometry or issues authority from painted dimensions. */
export function createPictureCropTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  host(): PictureReplacementHost | undefined;
  onStatus(text: string): void;
  onClose(): void;
}) {
  let disposed = false,
    epoch = 0,
    layer: ReturnType<typeof createDialogLayer> | undefined,
    form: ReturnType<typeof createPictureCropForm> | undefined;
  const port = createPictureCropPort(options.editor, options.host);
  function close() {
    epoch++;
    form?.dispose();
    form = undefined;
    layer?.destroy();
    layer = undefined;
  }
  return {
    presentation() {
      const state = options.editor.getEditorState();
      return (
        !disposed &&
        state.status === 'ready' &&
        !state.historyRecoveryRequired &&
        (state.capabilities as { pictureCropEditAvailable?: unknown; readOnly?: unknown })
          ?.pictureCropEditAvailable === true &&
        (state.capabilities as { readOnly?: unknown })?.readOnly !== true &&
        !!options.host()?.capturePictureReplacementSelection?.()
      );
    },
    async open() {
      if (disposed) return false;
      if (layer) {
        form?.focus();
        return true;
      }
      const ticket = ++epoch;
      let capture;
      try {
        capture = await port.capture();
      } catch {
        return false;
      }
      if (disposed || ticket !== epoch || !port.current(capture)) {
        await port.release(capture);
        return false;
      }
      layer = createDialogLayer(options.root, {
        role: 'object-properties',
        title: '개체 속성 - 그림 자르기',
        mode: 'modal',
        onDismiss: () => {
          close();
          options.onClose();
        },
      });
      form = createPictureCropForm({
        root: layer.body,
        editor: options.editor,
        host: options.host,
        gate: createObjectPropertiesEditGate(),
        onClose: () => {
          close();
          options.onClose();
        },
        onStatus: options.onStatus,
        prepared: { port, capture },
      });
      const cancel = options.root.ownerDocument.createElement('button');
      cancel.type = 'button';
      cancel.textContent = '취소';
      cancel.addEventListener('click', () => {
        close();
        options.onClose();
      });
      layer.footer.append(cancel);
      layer.show();
      form.focus();
      return true;
    },
    close,
    dispose() {
      disposed = true;
      close();
    },
  };
}
