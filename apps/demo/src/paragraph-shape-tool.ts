import type { CommandResult, HeadlessEditor } from '@hwpjs/core';
import {
  createParagraphShapeApi,
  supportsParagraphShapeApi,
  type ParagraphShapeCoreApi,
} from './paragraph-shape-api.ts';
import { createParagraphShapeController } from './paragraph-shape-controller.ts';
import { createParagraphShapeView } from './paragraph-shape-view.ts';
interface Options {
  root: HTMLElement;
  editor: Pick<HeadlessEditor, 'getEditorState' | 'registerStateListener' | 'dispatchCommand'> &
    Partial<Pick<HeadlessEditor, 'getFormattingCapabilities' | 'queryFormatting'>>;
  core: Partial<ParagraphShapeCoreApi>;
  onClose?(): void;
  onPresentationChange?(): void;
  onResult?(result: CommandResult): void;
  onUIError?(error: unknown): void;
  fallback?(): void;
  createView?: typeof createParagraphShapeView;
}
/** 모든 framework는 이 도구를 한 번만 연결합니다. 보통 입력의 presentation에는 Native 조회가 없습니다. */
export function createParagraphShapeTool(options: Options) {
  let disposed = false;
  const modalOpen = () => options.root.ownerDocument.querySelector('dialog:modal') !== null;
  // API presence is not Native atomic support; open still checks actual capabilities.
  const available = supportsParagraphShapeApi(options.editor, options.core);
  const controller = available
    ? createParagraphShapeController({
        api: createParagraphShapeApi(options.editor, options.core),
        getState: () => options.editor.getEditorState(),
        subscribe: (listener) => options.editor.registerStateListener(listener),
        createView: (callbacks) =>
          (options.createView ?? createParagraphShapeView)(options.root, callbacks),
        onClose: () => {
          if (!modalOpen()) options.onClose?.();
        },
        onPresentationChange: options.onPresentationChange,
        onResult: options.onResult,
        onUIError: options.onUIError,
        onUnavailable: options.fallback ? () => options.fallback?.() : undefined,
      })
    : undefined;
  return {
    available,
    presentation() {
      const state = options.editor.getEditorState(),
        current = controller?.presentation();
      const reason = disposed
        ? 'Disposed'
        : !available
          ? 'AtomicFormattingApiRequired'
          : state.status !== 'ready'
            ? 'EditorNotReady'
            : state.selection == null
              ? 'MissingSelection'
              : current?.loading || current?.pending
                ? 'FormattingPending'
                : modalOpen()
                  ? 'FormattingDialogOpen'
                  : null;
      return { enabled: reason === null, reason };
    },
    action(command: string) {
      if (command !== 'paragraph-properties' || !controller) return false;
      if (disposed) return true;
      if (modalOpen()) return true;
      controller.open();
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller?.dispose();
    },
  };
}
