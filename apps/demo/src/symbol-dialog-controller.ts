import type { EditorState, SelectionTarget } from '@hwpjs/core';
import { symbolTextError } from './symbol-catalog.ts';
import { createSymbolDialog } from './symbol-dialog-view.ts';

/** 대상과 큐는 호스트가 소유한다. 이 모듈은 발급된 선택의 관측 버전만 보관한다. */
export interface SymbolInsertionPort {
  capture(): { state: EditorState; target: SelectionTarget | null; reason: string | null };
  insert(
    capture: ReturnType<SymbolInsertionPort['capture']>,
    text: string,
  ): Promise<{ status: string; error?: string; caretRestored?: boolean; caretError?: string }>;
  subscribe(listener: (state: EditorState) => void): () => void;
}
export function createSymbolDialogController(options: {
  root: HTMLElement;
  port: SymbolInsertionPort;
  onClose: () => void;
  onStatus: (text: string) => void;
}) {
  let view: ReturnType<typeof createSymbolDialog> | undefined,
    captured: ReturnType<SymbolInsertionPort['capture']> | undefined,
    disposed = false,
    pending = false,
    epoch = 0;
  const close = (restore = false) => {
    const closingView = view,
      closingCapture = captured,
      closingEpoch = ++epoch;
    // 닫는 창을 먼저 분리하여 destroy 중 재진입이 같은 창을 다시 소유하지 못하게 한다.
    view = undefined;
    captured = undefined;
    let before: EditorState | undefined;
    try {
      if (restore && !disposed && closingView && closingCapture)
        before = options.port.capture().state;
    } finally {
      closingView?.destroy();
    }
    if (
      !before ||
      !closingCapture ||
      disposed ||
      epoch !== closingEpoch ||
      view ||
      before.status !== 'ready' ||
      !sameDocument(closingCapture.state, before)
    )
      return;
    const after = options.port.capture().state;
    if (
      !disposed &&
      epoch === closingEpoch &&
      !view &&
      after.status === 'ready' &&
      sameDocument(closingCapture.state, after)
    )
      options.onClose();
  };
  const sameDocument = (a: EditorState, b: EditorState) =>
    a.editorId === b.editorId && a.documentId === b.documentId && a.generation === b.generation;
  const reason = () => {
    const now = options.port.capture();
    if (
      !captured ||
      !sameDocument(captured.state, now.state) ||
      captured.state.stateVersion !== now.state.stateVersion
    )
      return '선택이 바뀌었습니다. 문자표를 다시 열어주세요.';
    return now.reason ?? (!captured.target ? '문서에서 넣을 위치를 선택하세요.' : null);
  };
  const insert = async (text: string) => {
    if (disposed || pending || !captured || !view) return;
    const invalid = symbolTextError(text) ?? reason();
    if (invalid) {
      view.setStatus(invalid);
      return;
    }
    const ticket = epoch,
      target = captured;
    let failure: string | undefined;
    pending = true;
    view.setBusy(true);
    try {
      const result = await options.port.insert(target, text);
      if (disposed || epoch !== ticket) return;
      if (result.status !== 'committed-with-snapshot' && result.status.startsWith('committed')) {
        options.onStatus(
          '명령은 반영됐지만 화면 확인이 필요합니다. 문서를 새로 확인하세요.' +
            (result.error ? ' (' + result.error + ')' : ''),
        );
        close(false);
        return;
      }
      if (result.error) throw Error(result.error);
      if (result.status !== 'committed-with-snapshot') throw Error('기호를 넣지 못했습니다.');
      if (result.caretRestored === false) {
        options.onStatus(
          '기호를 넣었습니다. 편집 위치를 복원하지 못했습니다. 문서에서 다시 선택하세요.' +
            (result.caretError ? ' (' + result.caretError + ')' : ''),
        );
        close(false);
        return;
      }
      options.onStatus('기호를 넣었습니다.');
      close(true);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      pending = false;
      if (!disposed && epoch === ticket) {
        view?.setBusy(false);
        view?.setAvailability(reason());
        if (failure) view?.setStatus(failure);
      }
    }
  };
  const unsubscribe = options.port.subscribe((state) => {
    if (!captured) return;
    if (!sameDocument(captured.state, state) || state.status !== 'ready') close(false);
    else if (!pending) view?.setAvailability(reason());
  });
  return {
    open() {
      if (disposed || pending) return;
      if (view) {
        view.focus();
        return;
      }
      captured = options.port.capture();
      if (captured.state.status !== 'ready') {
        options.onStatus('문서를 먼저 열어주세요.');
        captured = undefined;
        return;
      }
      view = createSymbolDialog(options.root, {
        onInsert: (text) => {
          void insert(text);
        },
        onDismiss: () => close(true),
      });
      view.setAvailability(reason());
    },
    close() {
      close(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      close(false);
    },
  };
}
