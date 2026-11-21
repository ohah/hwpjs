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
  return createObjectPropertiesController({
    ...options,
    port: createObjectPropertiesPort(options.editor, options.host),
    createView: (capture, draft, callbacks) => {
      let view: ReturnType<typeof createObjectPropertiesView> | undefined;
      const replacement = createPictureReplacementController({
        root: options.root,
        port: createPictureReplacementPort(options.editor, options.host),
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
          onReplace: () => replacement.choose(),
          replacementInput: replacement.input,
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
}
