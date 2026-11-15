import {
  createDrawingPropertiesPort,
  type DrawingPropertiesEditor,
} from './drawing-properties-port.ts';
import { createDrawingPropertiesController } from './drawing-properties-controller.ts';
import { createDrawingPropertiesView } from './drawing-properties-view.ts';

export interface DrawingPropertiesToolOptions {
  root: HTMLElement;
  editor: DrawingPropertiesEditor;
  onStatus?(text: string): void;
  onClose?(): void;
  onPresentationChange?(): void;
  onError?(error: unknown): void;
}

export interface DrawingPropertiesTool {
  open(target: { section: number; drawingNode: number }): void;
  dispose(): void;
}

/** Current source information only; no Native editing capability is requested or implied. */
export function createDrawingPropertiesTool(
  options: DrawingPropertiesToolOptions,
): DrawingPropertiesTool {
  const controller = createDrawingPropertiesController({
    ...options,
    port: createDrawingPropertiesPort(options.editor),
    createView: (capture, onDismiss) =>
      createDrawingPropertiesView(options.root, capture, onDismiss),
  });
  return {
    open(target) {
      controller.open(target);
    },
    dispose() {
      controller.dispose();
    },
  };
}
