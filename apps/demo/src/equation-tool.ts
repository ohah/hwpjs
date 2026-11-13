import type { HeadlessEditor } from '@hwpjs/core';
import { createEquationPort, equationAvailability } from './equation-port.ts';
import { createEquationView } from './equation-view.ts';

export function createEquationTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  onStatus(text: string): void;
  onPresentationChange?(): void;
  onClose(): void;
  createView?: typeof createEquationView;
}) {
  let disposed = false;
  let active:
    | { port: ReturnType<typeof createEquationPort>; view: ReturnType<typeof createEquationView> }
    | undefined;
  const modalOpen = () => options.root.ownerDocument.querySelector('dialog:modal') !== null;
  function close(restore: boolean) {
    const previous = active;
    active = undefined;
    previous?.port.close();
    previous?.view.destroy();
    options.onPresentationChange?.();
    if (previous && restore && !disposed && options.editor.getEditorState().status === 'ready')
      options.onClose();
  }
  return {
    presentation() {
      const value = equationAvailability(options.editor.getEditorState());
      return {
        enabled: !disposed && !active && !modalOpen() && value.enabled,
        reason:
          value.reason ??
          (disposed || active || modalOpen() ? '열린 창을 닫고 다시 사용하세요.' : undefined),
      };
    },
    open() {
      if (!this.presentation().enabled) return;
      const port = createEquationPort(options.editor, {
        receive: (message) => active?.view.message(message),
        invalidate: (reason) => {
          close(false);
          options.onStatus(reason);
        },
      });
      try {
        const view = (options.createView ?? createEquationView)(options.root, {
          ready: port.ready,
          request: port.request,
          onDismiss: () => close(true),
        });
        active = { port, view };
        if (!port.enable()) {
          close(false);
          return;
        }
        view.show();
        options.onPresentationChange?.();
      } catch (error) {
        port.close();
        close(false);
        throw error;
      }
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        close(false);
      }
    },
  };
}
