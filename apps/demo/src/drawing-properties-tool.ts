import type { ObjectGeometryEditor } from './object-geometry-form.ts';
import {
  createDrawingPropertiesPort,
  type DrawingPropertiesEditor,
} from './drawing-properties-port.ts';
import { createDrawingPropertiesController } from './drawing-properties-controller.ts';
import { createDrawingPropertiesView } from './drawing-properties-view.ts';

export interface DrawingPropertiesToolOptions {
  root: HTMLElement;
  editor: DrawingPropertiesEditor & Partial<ObjectGeometryEditor>;
  onStatus?(text: string): void;
  onClose?(): void;
  onPresentationChange?(): void;
  onError?(error: unknown): void;
}

export interface DrawingPropertiesTool {
  open(target: { section: number; drawingNode: number }): void;
  dispose(): void;
}

/** Source observation and fresh typed Native geometry edits use separate authority. */
export function createDrawingPropertiesTool(
  options: DrawingPropertiesToolOptions,
): DrawingPropertiesTool {
  const controller = createDrawingPropertiesController({
    ...options,
    port: createDrawingPropertiesPort(options.editor),
    createView: (capture, onDismiss) =>
      createDrawingPropertiesView(
        options.root,
        capture,
        onDismiss,
        typeof options.editor.getObjectGeometry === 'function' &&
          typeof options.editor.dispatchCommand === 'function'
          ? (options.editor as ObjectGeometryEditor)
          : undefined,
      ),
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
