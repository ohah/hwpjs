import { createPictureCropTool } from './picture-crop-tool.ts';
import {
  createObjectPropertiesEditGate,
  type ObjectPropertiesEditGate,
} from './object-properties-edit-gate.ts';
import {
  createHwp5PictureOuterMarginsTool,
  captureHwp5PictureMarginsSelection,
} from './hwp5-picture-outer-margins-tool.ts';
import type { ObjectPropertiesCapture } from './object-properties-port.ts';
import {
  createPictureReplacementPort,
  type PictureReplacementHost,
} from './picture-replacement-port.ts';
import { createPictureReplacementController } from './picture-replacement-controller.ts';
import type { HeadlessEditor } from '@hwpjs/core';
import { createObjectPropertiesPort, type ObjectPropertiesHost } from './object-properties-port.ts';
import { createObjectPropertiesController } from './object-properties-controller.ts';
import { createObjectPropertiesView } from './object-properties-view.ts';

export function createObjectPropertiesTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  host(): (ObjectPropertiesHost & PictureReplacementHost) | undefined;
  onStatus(text: string): void;
  onClose(): void;
  onPresentationChange?(): void;
  onError?(error: unknown): void;
}) {
  let openRequest = 0,
    disposed = false;
  const gates = new WeakMap<ObjectPropertiesCapture, ObjectPropertiesEditGate>();
  const originalPort = createObjectPropertiesPort(options.editor, options.host);
  const resizePort = {
    ...originalPort,
    async apply(capture: ObjectPropertiesCapture, draft: Parameters<typeof originalPort.apply>[1]) {
      const gate = gates.get(capture);
      if (gate && !gate.begin('geometry'))
        return {
          status: 'rejected-unapplied',
          error: '바깥 여백과 크기는 한 번에 하나씩 변경하세요.',
        };
      try {
        return await originalPort.apply(capture, draft);
      } finally {
        gate?.end('geometry');
      }
    },
  };
  const cropOnly = createPictureCropTool(options);
  const marginsOnly = createHwp5PictureOuterMarginsTool(options);
  const controller = createObjectPropertiesController({
    ...options,
    port: resizePort,
    createView: (capture, draft, callbacks) => {
      let view: ReturnType<typeof createObjectPropertiesView> | undefined;
      const h5 = (capture.state.content as { format?: unknown } | undefined)?.format === 'hwp5';
      const gate = createObjectPropertiesEditGate();
      if (gate) gates.set(capture, gate);
      const marginSelection = h5
        ? captureHwp5PictureMarginsSelection(options.editor, options.host)
        : null;
      const replacementPort = createPictureReplacementPort(options.editor, options.host);
      const replacement = createPictureReplacementController({
        root: options.root,
        port: {
          ...replacementPort,
          async submit(owner, bytes) {
            if (gate && !gate.begin('geometry'))
              throw Error('바깥 여백과 이미지 파일은 한 번에 하나씩 변경하세요.');
            try {
              return await replacementPort.submit(owner, bytes);
            } finally {
              gate?.end('geometry');
            }
          },
        },
        setAvailability: (enabled, reason) => view?.setReplacementAvailability?.(enabled, reason),
        setBusy: (value, sent) =>
          view?.setReplacementPending?.(value ? (sent ? 'sending' : 'reading') : null),
        onStatus: options.onStatus,
        onError: options.onError,
        onClose: callbacks.onDismiss,
      });
      // Start the Native observation before entering the modal. The host's
      // captured picture receipt remains separate from generic object mode.
      void replacement.prepare();
      try {
        view = createObjectPropertiesView(options.root, capture, draft, {
          ...callbacks,
          editGate: gate,
          crop: { editor: options.editor, host: options.host, gate, onStatus: options.onStatus },
          onReplace: () => replacement.choose(),
          replacementInput: replacement.input,
          ...(h5 && gate && capture.target && marginSelection
            ? {
                outerMargins: {
                  editor: options.editor,
                  selector: marginSelection.selector,
                  current: () =>
                    marginSelection?.current() === true &&
                    marginSelection.state === capture.state &&
                    marginSelection.selector.section === capture.target?.section &&
                    marginSelection.geometryPictureNode === capture.target?.pictureNode,
                  gate,
                },
              }
            : {}),
        });
      } catch (error) {
        replacement.dispose();
        throw error;
      }
      const created = view;
      return {
        ...created,
        setAvailability(reason) {
          created.setAvailability(reason);
          replacement.check();
        },
        destroy() {
          replacement.dispose();
          created.destroy();
        },
      };
    },
  });
  return {
    ...controller,
    presentation() {
      const normal = controller.presentation();
      return normal.enabled || !cropOnly.presentation() ? normal : { enabled: true };
    },
    async open() {
      const ticket = ++openRequest,
        snapshot = options.editor.getEditorState();
      if (disposed) return;
      if (originalPort.capture().reason && cropOnly.presentation()) {
        controller.close();
        marginsOnly.close();
        const opened = await cropOnly.open();
        if (disposed || ticket !== openRequest || options.editor.getEditorState() !== snapshot)
          return;
        if (opened) return;
      }
      cropOnly.close();
      const state = options.editor.getEditorState();
      if ((state.content as { format?: unknown } | undefined)?.format !== 'hwp5') {
        marginsOnly.close();
        controller.open();
        return;
      }
      const marginCapture = marginsOnly.capture();
      if (!marginCapture) {
        controller.open();
        return;
      }
      const resizeCapture = originalPort.capture();
      if (
        options.editor.getEditorState() !== state ||
        (marginCapture && !marginCapture.current())
      ) {
        options.onStatus('그림 선택이나 문서가 바뀌었습니다. 다시 선택하세요.');
        return;
      }
      if (resizeCapture.reason && marginCapture) {
        controller.close();
        marginsOnly.open(marginCapture);
        return;
      }
      marginsOnly.close();
      controller.open();
    },
    close() {
      openRequest++;
      cropOnly.close();
      marginsOnly.close();
      controller.close();
    },
    dispose() {
      disposed = true;
      openRequest++;
      cropOnly.dispose();
      marginsOnly.dispose();
      controller.dispose();
    },
  };
}
