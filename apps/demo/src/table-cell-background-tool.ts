import type { HeadlessEditor } from '@hwpjs/core';
import type { TableCellCore } from './table-cell-properties-port.ts';
import {
  createTableCellBackgroundPort,
  tableCellBackgroundReason,
  type TableCellBackgroundPort,
  type TableCellBackgroundCapture,
  type TableCellBackgroundDraft,
} from './table-cell-background-port.ts';
import {
  createTableCellBackgroundView,
  type TableCellBackgroundView,
} from './table-cell-background-view.ts';

export function createTableCellBackgroundController(options: {
  root: HTMLElement;
  port: TableCellBackgroundPort;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
  createView?: typeof createTableCellBackgroundView;
}) {
  let disposed = false,
    pending = false,
    epoch = 0;
  let view: TableCellBackgroundView | undefined, captured: TableCellBackgroundCapture | undefined;
  const sameDocument = (a: TableCellBackgroundCapture, b: TableCellBackgroundCapture) =>
    a.state.editorId === b.state.editorId &&
    a.state.documentId === b.state.documentId &&
    a.state.generation === b.state.generation;
  function close(restore: boolean, completedNoOp = false) {
    const old = view,
      lease = captured,
      ticket = ++epoch;
    view = undefined;
    captured = undefined;
    try {
      old?.destroy();
    } finally {
      options.onPresentationChange?.();
      if (
        restore &&
        !disposed &&
        (!pending || completedNoOp) &&
        old &&
        lease &&
        ticket === epoch &&
        options.port.isCurrent(lease)
      )
        options.onClose();
    }
  }
  async function submit(draft: TableCellBackgroundDraft, ticket: number) {
    if (disposed || pending || ticket !== epoch || !view || !captured) return;
    const lease = captured,
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
        const finalState = options.port.capture().state;
        close(false);
        const completed = epoch;
        options.onStatus(
          status === 'committed-with-snapshot'
            ? '셀 배경을 적용했습니다.' + (restored ? '' : ' 커서 위치를 다시 선택해주세요.')
            : '배경은 반영됐지만 표시 확인이 필요합니다. 다시 적용하지 마세요.',
        );
        if (
          restored &&
          !disposed &&
          completed === epoch &&
          !view &&
          options.port.capture().state === finalState
        )
          options.onClose();
      } else if (status === 'known-no-op') close(true, true);
      else
        currentView.setStatus(
          'error' in result && typeof result.error === 'string'
            ? tableCellBackgroundReason(result.error)
            : '셀 배경을 적용하지 못했습니다.',
        );
    } catch {
      if (!disposed && ticket === epoch && sameDocument(lease, options.port.capture())) {
        close(false);
        options.onStatus(
          '접수된 셀 배경 변경 결과가 불확실합니다. 문서를 확인하고 다시 적용하지 마세요.',
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
    else if (!pending && (!options.port.isCurrent(captured) || now.writeReason))
      view.setStale(
        now.writeReason
          ? tableCellBackgroundReason(now.writeReason)
          : '선택 또는 문서 상태가 바뀌었습니다. 창을 다시 열어주세요.',
      );
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
        options.onStatus(tableCellBackgroundReason(lease.reason ?? 'SelectOriginalTableCell'));
        return;
      }
      captured = lease;
      const ticket = ++epoch;
      view = (options.createView ?? createTableCellBackgroundView)(options.root, lease, {
        apply: (draft) => {
          if (ticket === epoch) void submit(draft, ticket);
        },
        dismiss: () => {
          if (!disposed && ticket === epoch) close(true);
        },
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
export function createTableCellBackgroundTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: Partial<TableCellCore>;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
}) {
  return createTableCellBackgroundController({
    ...options,
    port: createTableCellBackgroundPort(options.editor, options.core),
  });
}
