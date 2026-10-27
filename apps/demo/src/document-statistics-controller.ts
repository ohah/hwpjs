import { getDocumentTextStatistics, type HeadlessEditor } from '@hwpjs/core';
export type DocumentStatistics = ReturnType<typeof getDocumentTextStatistics>;
export interface StatisticsView {
  show(): void;
  update(value: DocumentStatistics): void;
  error(message: string): void;
  destroy(): void;
}
export function createDocumentStatisticsController({
  editor,
  createView,
  onClose,
  onStatus,
}: {
  editor: Pick<HeadlessEditor, 'getEditorState' | 'registerStateListener'>;
  createView: (dismiss: () => void) => StatisticsView;
  onClose?: () => void;
  onStatus: (message: string) => void;
}) {
  let view: StatisticsView | undefined;
  let owner: { documentId: unknown; generation: number } | undefined;
  let disposed = false;
  const sameDocument = (state: ReturnType<HeadlessEditor['getEditorState']>) =>
    state.status === 'ready' &&
    state.documentId === owner?.documentId &&
    state.generation === owner?.generation;
  const close = (restoreFocus = false) => {
    const restore = !!view && !disposed && sameDocument(editor.getEditorState());
    const previous = view;
    view = undefined;
    owner = undefined;
    previous?.destroy();
    if (restoreFocus && restore) onClose?.();
  };
  const refresh = () => {
    if (!view || disposed) return;
    const current = editor.getEditorState();
    if (!sameDocument(current)) {
      close();
      return;
    }
    try {
      const statistics = getDocumentTextStatistics(current);
      if (view && sameDocument(editor.getEditorState())) view.update(statistics);
      else close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      view?.error('문서 통계를 확인할 수 없습니다.');
      onStatus(message);
    }
  };
  const unsubscribe = editor.registerStateListener(() => refresh());
  return {
    get isOpen() {
      return !!view;
    },
    open() {
      if (disposed) return false;
      const state = editor.getEditorState();
      if (state.status !== 'ready') {
        onStatus('문서를 먼저 열어주세요.');
        return false;
      }
      if (view) {
        refresh();
        view?.show();
        return true;
      }
      owner = { documentId: state.documentId, generation: state.generation };
      view = createView(() => close(true));
      view.show();
      refresh();
      return true;
    },
    close,
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        unsubscribe();
      } finally {
        close();
      }
    },
  };
}
