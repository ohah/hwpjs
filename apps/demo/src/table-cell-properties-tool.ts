import type { HeadlessEditor } from '@hwpjs/core';
import {
  createTableCellPropertiesPort,
  tableCellReason,
  type TableCellCore,
  type TableCellPropertiesPort,
  type TableCellCapture,
  type TableCellDraft,
} from './table-cell-properties-port.ts';
import {
  createTableCellPropertiesView,
  type TableCellPropertiesView,
} from './table-cell-properties-view.ts';

export function createTableCellPropertiesController(options: {
  root: HTMLElement;
  port: TableCellPropertiesPort;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
  createView?: typeof createTableCellPropertiesView;
}) {
  let disposed = false,
    pending = false,
    epoch = 0;
  let view: TableCellPropertiesView | undefined, captured: TableCellCapture | undefined;
  const sameDocument = (a: TableCellCapture, b: TableCellCapture) =>
    a.state.editorId === b.state.editorId &&
    a.state.documentId === b.state.documentId &&
    a.state.generation === b.state.generation;
  function close(restore: boolean) {
    const old = view,
      lease = captured,
      closing = ++epoch;
    view = undefined;
    captured = undefined;
    try {
      old?.destroy();
    } finally {
      options.onPresentationChange?.();
      if (
        restore &&
        !disposed &&
        old &&
        lease &&
        closing === epoch &&
        options.port.capture().state === lease.state
      )
        options.onClose();
    }
  }
  async function submit(draft: TableCellDraft) {
    if (disposed || pending || !view || !captured) return;
    const lease = captured,
      ticket = epoch,
      currentView = view;
    pending = true;
    currentView.setBusy(true);
    options.onPresentationChange?.();
    try {
      const result = await options.port.apply(lease, draft);
      if (disposed || ticket !== epoch || !sameDocument(lease, options.port.capture())) return;
      const status = 'status' in result && typeof result.status === 'string' ? result.status : '';
      if (status.startsWith('committed')) {
        const restored = await options.port.restoreSelection(lease, result);
        if (disposed || ticket !== epoch || !sameDocument(lease, options.port.capture())) return;
        close(false);
        const completed = epoch;
        options.onStatus(
          status === 'committed-with-snapshot'
            ? '셀 크기를 적용했습니다.' + (restored ? '' : ' 커서 위치를 다시 선택해주세요.')
            : '크기는 반영됐지만 표시 확인이 필요합니다. 다시 적용하지 마세요.',
        );
        if (
          restored &&
          !disposed &&
          completed === epoch &&
          !view &&
          sameDocument(lease, options.port.capture()) &&
          options.port.capture().state.status === 'ready'
        )
          options.onClose();
      } else if (status === 'known-no-op') close(true);
      else
        currentView.setStatus(
          'error' in result && typeof result.error === 'string'
            ? tableCellReason(result.error)
            : '셀 크기를 적용하지 못했습니다.',
        );
    } catch {
      if (!disposed && ticket === epoch && sameDocument(lease, options.port.capture())) {
        close(false);
        options.onStatus(
          '접수된 셀 변경 결과가 불확실합니다. 문서를 확인하고 다시 적용하지 마세요.',
        );
      }
    } finally {
      pending = false;
      if (!disposed) {
        if (ticket === epoch) view?.setBusy(false);
        options.onPresentationChange?.();
      }
    }
  }
  const unsubscribe = options.port.subscribe(() => {
    if (!view || !captured) return;
    const now = options.port.capture();
    if (!sameDocument(captured, now) || ['empty', 'loading', 'disposed'].includes(now.state.status))
      close(false);
    else if (!pending && now.state !== captured.state)
      view.setStale('선택 또는 문서 상태가 바뀌었습니다. 창을 다시 열어주세요.');
  });
  return {
    presentation: () => options.port.presentation(),
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
      const lease = options.port.capture();
      if (lease.reason || !lease.cell) {
        options.onStatus(lease.reason ? tableCellReason(lease.reason) : '표 셀을 선택하세요.');
        return;
      }
      captured = lease;
      ++epoch;
      view = (options.createView ?? createTableCellPropertiesView)(options.root, lease, {
        apply: (draft) => {
          void submit(draft);
        },
        dismiss: () => close(true),
      });
    },
    close: () => close(true),
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        unsubscribe();
      } finally {
        try {
          close(false);
        } finally {
          options.port.dispose();
        }
      }
    },
  };
}
export function createTableCellPropertiesTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: Partial<TableCellCore>;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
}) {
  return createTableCellPropertiesController({
    ...options,
    port: createTableCellPropertiesPort(options.editor, options.core),
  });
}
