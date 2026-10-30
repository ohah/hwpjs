import {
  createTableInsertBridge,
  type TableInsertBridge,
  type TableInsertCapture,
  type TableInsertCore,
  type TableInsertDraft,
} from './table-insert-bridge.ts';
import { createTableInsertDialog } from './table-insert-dialog.ts';
import type { HeadlessEditor } from '@hwpjs/core';
export function createTableInsertController(options: {
  root: HTMLElement;
  bridge: TableInsertBridge;
  onStatus: (message: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
}) {
  let view: ReturnType<typeof createTableInsertDialog> | undefined,
    lease: TableInsertCapture | undefined,
    disposed = false,
    pending = false,
    epoch = 0;
  const sameDocument = (a: TableInsertCapture, b: TableInsertCapture) =>
    a.state.editorId === b.state.editorId &&
    a.state.documentId === b.state.documentId &&
    a.state.generation === b.state.generation;
  const liveDocument = (a: TableInsertCapture, b: TableInsertCapture) =>
    sameDocument(a, b) && !['disposed', 'loading', 'empty'].includes(b.state.status);
  function close(restore: boolean) {
    const old = view,
      captured = lease,
      closing = ++epoch;
    view = undefined;
    lease = undefined;
    old?.destroy();
    if (
      old &&
      captured &&
      restore &&
      !disposed &&
      closing === epoch &&
      sameDocument(captured, options.bridge.capture()) &&
      options.bridge.capture().state.status === 'ready'
    )
      options.onClose();
  }
  const reason = () =>
    !lease || options.bridge.capture().state !== lease.state
      ? '선택이 바뀌었습니다. 표 만들기를 다시 열어주세요.'
      : lease.reason;
  async function submit(draft: TableInsertDraft) {
    if (!view || !lease || pending || disposed) return;
    const why = reason();
    if (why) {
      view.setAvailability(why);
      return;
    }
    const current = lease,
      ticket = epoch;
    let failure: string | undefined;
    pending = true;
    view.setBusy(true);
    options.onPresentationChange?.();
    try {
      const result = await options.bridge.insert(current, draft);
      if (disposed || ticket !== epoch || !liveDocument(current, options.bridge.capture())) return;
      if (result.status.startsWith('committed')) {
        options.onStatus(
          result.status === 'committed-with-snapshot'
            ? '표를 만들었습니다. 새 표 자동 선택·셀 편집은 지원하지 않습니다.'
            : '표는 반영됐지만 표시 확인이 필요합니다. 다시 만들지 마세요.',
        );
        close(false);
      } else {
        failure = result.error ?? '표를 만들지 못했습니다.';
      }
    } catch (error) {
      // A transport exception is not proof of unapplied mutation. Never auto retry.
      if (!disposed && ticket === epoch && liveDocument(current, options.bridge.capture())) {
        options.onStatus('표 삽입 결과를 확인할 수 없습니다. 문서를 확인하세요. ' + String(error));
        close(false);
      }
    } finally {
      pending = false;
      if (!disposed) options.onPresentationChange?.();
      if (!disposed && ticket === epoch) {
        view?.setBusy(false);
        if (reason()) view?.setAvailability(reason());
        if (failure) view?.setStatus(failure);
      }
    }
  }
  const unsubscribe = options.bridge.subscribe(() => {
    if (!lease) return;
    const now = options.bridge.capture();
    if (!liveDocument(lease, now)) close(false);
    else if (!pending && now.state.status !== 'ready') close(false);
    else if (!pending && view) view.setAvailability(reason());
  });
  return {
    presentation: () => options.bridge.presentation(),
    open() {
      if (disposed || pending) return;
      if (view) {
        view.focus();
        return;
      }
      if (options.root.querySelector('dialog:modal')) {
        options.onStatus('열린 대화상자를 먼저 닫아주세요.');
        return;
      }
      lease = options.bridge.capture();
      if (lease.reason) {
        options.onStatus(lease.reason);
        lease = undefined;
        return;
      }
      ++epoch;
      view = createTableInsertDialog(options.root, {
        onInsert: (draft) => {
          void submit(draft);
        },
        onDismiss: () => close(true),
      });
    },
    close: () => close(true),
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      close(false);
      options.bridge.dispose();
    },
  };
}
export function createTableInsertTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: Partial<TableInsertCore>;
  onStatus: (message: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
}) {
  return createTableInsertController({
    ...options,
    bridge: createTableInsertBridge(options.editor, options.core),
  });
}
