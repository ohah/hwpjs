import type { EditorState } from '@hwpjs/core';
export type CellToolCapture = {
  state: EditorState;
  cell: unknown;
  reason: string | null;
  writeReason: string | null;
};
export type CellToolView = {
  focus(): void;
  setBusy(value: boolean): void;
  setStale(value: string): void;
  setStatus(value: string): void;
  destroy(): void;
};
export type CellToolPort<Capture extends CellToolCapture, Draft> = {
  capture(): Capture;
  isCurrent(capture: Capture): boolean;
  presentation(): { enabled: boolean; reason?: string };
  subscribe(listener: (state: EditorState) => void): () => void;
  apply(capture: Capture, draft: Draft): Promise<{ status?: string; error?: unknown }>;
  restoreSelection(capture: Capture, result: unknown): Promise<boolean>;
  dispose(): void;
};
/** One dialog lifecycle for original-cell tools; selection fences remain in the shared port. */
export function createTableCellToolController<Capture extends CellToolCapture, Draft>(options: {
  root: HTMLElement;
  port: CellToolPort<Capture, Draft>;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
  createView: (
    root: HTMLElement,
    captured: Capture,
    callbacks: { apply: (draft: Draft) => void; dismiss: () => void },
  ) => CellToolView;
  reason: (code: string) => string;
  messages: { applied: string; refresh: string; failed: string; uncertain: string };
}) {
  let disposed = false,
    pending = false,
    epoch = 0;
  let view: CellToolView | undefined, captured: Capture | undefined;
  const sameDocument = (a: Capture, b: Capture) =>
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
  async function submit(draft: Draft, ticket: number) {
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
            ? options.messages.applied + (restored ? '' : ' 커서 위치를 다시 선택해주세요.')
            : options.messages.refresh,
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
            ? options.reason(result.error)
            : options.messages.failed,
        );
    } catch {
      if (!disposed && ticket === epoch && sameDocument(lease, options.port.capture())) {
        close(false);
        options.onStatus(options.messages.uncertain);
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
          ? options.reason(now.writeReason)
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
        options.onStatus(options.reason(lease.reason ?? 'SelectOriginalTableCell'));
        return;
      }
      captured = lease;
      const ticket = ++epoch;
      view = options.createView(options.root, lease, {
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
