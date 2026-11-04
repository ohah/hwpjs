import type { HeadlessEditor } from '@hwpjs/core';
import { createObjectPropertiesPort, type ObjectPropertiesHost } from './object-properties-port.ts';
import { createObjectPropertiesController } from './object-properties-controller.ts';
import { createObjectPropertiesView } from './object-properties-view.ts';

export function createObjectPropertiesTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  host(): ObjectPropertiesHost | undefined;
  onStatus(text: string): void;
  onClose(): void;
  onPresentationChange?(): void;
  onError?(error: unknown): void;
}) {
  return createObjectPropertiesController({
    ...options,
    port: createObjectPropertiesPort(options.editor, options.host),
    createView: (capture, draft, callbacks) =>
      createObjectPropertiesView(options.root, capture, draft, callbacks),
  });
}
