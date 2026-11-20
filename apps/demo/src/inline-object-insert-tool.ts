import type { HeadlessEditor } from '@hwpjs/core';
import type { Hwp5ChartCreateOptions } from '../../../js/hwp5-chart-create.mjs';
import type {
  InlineObjectKind,
  EquationInsertOptions,
  ChartCreateOptions,
} from '../../../packages/core/src/commands/inline-object-insert.ts';
import {
  createInlineObjectInsertPort,
  type InlineObjectInsertCore,
  type InlineObjectInsertCapture,
  type InlineObjectCaretCapture,
} from './inline-object-insert-port.ts';
import { createInlineObjectInsertDialog } from './inline-object-insert-dialog.ts';
import { createHwp5ChartCanvasProvider } from './hwp5-chart-canvas-provider.mjs';
import { createHwp5ChartCreatePreviewPort } from './hwp5-chart-create-preview-port.ts';
import './inline-object-insert-style.css';

export function createInlineObjectInsertTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: Partial<InlineObjectInsertCore>;
  onStatus(text: string): void;
  onPresentationChange?(): void;
  onClose(): void;
  captureCaret?(): InlineObjectCaretCapture | null;
}) {
  const port = createInlineObjectInsertPort(options.editor, options.core, options.captureCaret);
  let view: ReturnType<typeof createInlineObjectInsertDialog> | undefined;
  let capture: InlineObjectInsertCapture | undefined;
  let preview: ReturnType<typeof createHwp5ChartCreatePreviewPort> | undefined;
  let pending = false,
    previewPending = false,
    opening = false,
    disposed = false,
    epoch = 0,
    previewSerial = 0;
  function cancelPreview() {
    ++previewSerial;
    previewPending = false;
    preview?.invalidate();
    view?.setPreviewBusy(false);
  }
  function close(restore = false) {
    const oldView = view,
      old = capture;
    ++epoch;
    ++previewSerial;
    previewPending = false;
    view = undefined;
    capture = undefined;
    preview?.dispose();
    preview = undefined;
    oldView?.destroy();
    if (restore && oldView && old && !disposed && options.editor.getEditorState() === old.state)
      options.onClose();
  }
  async function showPreview(draft: Hwp5ChartCreateOptions) {
    if (!capture || !view || !preview || pending || previewPending || disposed) return;
    const lease = capture,
      targetView = view,
      backend = preview,
      ticket = epoch,
      serial = ++previewSerial;
    if (!port.current(lease)) {
      targetView.setUnavailable('선택이 바뀌었습니다. 창을 다시 열어주세요.');
      return;
    }
    previewPending = true;
    targetView.setPreviewBusy(true);
    options.onPresentationChange?.();
    try {
      const { profile, preview: _pixels, ...values } = draft;
      const prepared = await backend.prepare(lease, values, profile);
      if (
        disposed ||
        ticket !== epoch ||
        serial !== previewSerial ||
        view !== targetView ||
        !backend.current(prepared)
      )
        return;
      targetView.showPreview(prepared.preview);
    } catch (error) {
      if (!disposed && ticket === epoch && serial === previewSerial && view === targetView)
        options.onStatus(String(error));
    } finally {
      if (serial === previewSerial) {
        previewPending = false;
        if (view === targetView) targetView.setPreviewBusy(false);
      }
      if (!disposed) options.onPresentationChange?.();
    }
  }
  async function submit(
    draft: EquationInsertOptions | ChartCreateOptions | Hwp5ChartCreateOptions,
  ) {
    if (!capture || !view || pending || previewPending || disposed) return;
    const lease = capture,
      ticket = epoch;
    if (!port.current(lease)) {
      view.setUnavailable('선택이 바뀌었습니다. 창을 다시 열어주세요.');
      return;
    }
    cancelPreview();
    pending = true;
    view.setBusy(true);
    options.onPresentationChange?.();
    try {
      const result = await port.insert(lease, draft);
      if (disposed || ticket !== epoch) return;
      const now = options.editor.getEditorState();
      if (now.documentId !== lease.state.documentId || now.generation !== lease.state.generation) {
        close();
        return;
      }
      options.onStatus(
        result.status === 'committed-with-snapshot'
          ? '새 개체를 삽입했습니다.'
          : result.status === 'committed-refresh-required'
            ? '삽입 결과의 표시를 확인해야 합니다. 다시 삽입하지 마세요.'
            : (result.error ?? '삽입되지 않았습니다. 창을 다시 열어주세요.'),
      );
      close();
      options.onClose();
    } catch (error) {
      if (!disposed && ticket === epoch) {
        const now = options.editor.getEditorState();
        if (now.documentId === lease.state.documentId && now.generation === lease.state.generation)
          options.onStatus(
            '삽입 결과를 확인할 수 없습니다. 문서를 확인한 뒤 진행하세요. ' + String(error),
          );
        close();
      }
    } finally {
      pending = false;
      if (!disposed) options.onPresentationChange?.();
    }
  }
  const unsubscribe = port.subscribe(() => {
    if (capture) {
      const now = options.editor.getEditorState();
      if (
        now.documentId !== capture.state.documentId ||
        now.generation !== capture.state.generation
      )
        close();
      else if (!pending && !port.current(capture)) {
        cancelPreview();
        view?.setUnavailable('선택이 바뀌었습니다. 창을 다시 열어주세요.');
      }
    }
    view?.setChartProfileVersion(port.chartCreateProfileVersion());
    options.onPresentationChange?.();
  });
  function show(captured: InlineObjectInsertCapture, kind: InlineObjectKind) {
    if (!port.current(captured)) throw Error('StaleInlineObjectInsert');
    capture = captured;
    ++epoch;
    const content = captured.state.content;
    const format = content && typeof content === 'object' && 'format' in content && typeof content.format === 'string' ? content.format : undefined;
    if (kind === 'chart' && format === 'hwp5') {
      const helper = options.core.hwp5ChartCreatePreviewMessage,
        availability = options.core.getInlineObjectInsertAvailability;
      if (!helper || !availability) throw Error('InlineObjectInsertionUnavailable');
      const provider = createHwp5ChartCanvasProvider(options.root.ownerDocument);
      preview = createHwp5ChartCreatePreviewPort({
        editor: options.editor,
        core: {
          hwp5ChartCreatePreviewMessage: helper,
          getInlineObjectInsertAvailability: availability,
        },
        isCaptureCurrent: (value) => port.current(value),
        render: provider.render,
      });
    }
    view = createInlineObjectInsertDialog(options.root, kind, {
      format,
      chartCreateProfileVersion: port.chartCreateProfileVersion(),
      onInsert: (draft) => {
        void submit(draft);
      },
      ...(preview
        ? {
            onPreview: (draft: Hwp5ChartCreateOptions) => {
              void showPreview(draft);
            },
            onDraftChange: cancelPreview,
          }
        : {}),
      onDismiss: () => {
        if (!pending) close(true);
      },
    });
  }
  return {
    presentation(kind: InlineObjectKind) {
      return pending || previewPending || opening || disposed
        ? {
            enabled: false,
            reason:
              pending || previewPending || opening
                ? '새 개체를 삽입하는 중입니다.'
                : '삽입 도구가 종료되었습니다.',
          }
        : port.presentation(kind);
    },
    open(kind: InlineObjectKind) {
      if (disposed || pending || previewPending || opening) return;
      if (view) {
        view.focus();
        return;
      }
      if (options.root.querySelector('dialog:modal')) {
        options.onStatus('열린 창을 먼저 닫아주세요.');
        return;
      }
      if (options.captureCaret) {
        opening = true;
        const ticket = epoch;
        void port
          .captureAtCaret(kind)
          .then((captured) => {
            if (disposed || ticket !== epoch) return;
            show(captured, kind);
          })
          .catch((error) => {
            if (!disposed && ticket === epoch) {
              options.onStatus(String(error));
              close();
            }
          })
          .finally(() => {
            opening = false;
            if (!disposed) options.onPresentationChange?.();
          });
        return;
      }
      try {
        show(port.capture(kind), kind);
      } catch (error) {
        options.onStatus((error as Error).message);
        close();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      close();
    },
  };
}
