import type { HeadlessEditor } from '@hwpjs/core';
import type {
  InlineObjectKind,
  EquationInsertOptions,
  ChartCreateOptions,
} from '../../../packages/core/src/commands/inline-object-insert.ts';
import {
  createInlineObjectInsertPort,
  type InlineObjectInsertCore,
  type InlineObjectInsertCapture,
} from './inline-object-insert-port.ts';
import { createInlineObjectInsertDialog } from './inline-object-insert-dialog.ts';
import './inline-object-insert-style.css';

export function createInlineObjectInsertTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: Partial<InlineObjectInsertCore>;
  onStatus(text: string): void;
  onPresentationChange?(): void;
  onClose(): void;
}) {
  const port = createInlineObjectInsertPort(options.editor, options.core);
  let view: ReturnType<typeof createInlineObjectInsertDialog> | undefined;
  let capture: InlineObjectInsertCapture | undefined;
  let pending = false,
    disposed = false,
    epoch = 0;
  function close(restore = false) {
    const hadView = !!view,
      old = capture;
    ++epoch;
    view?.destroy();
    view = undefined;
    capture = undefined;
    if (restore && hadView && old && !disposed && options.editor.getEditorState() === old.state)
      options.onClose();
  }
  async function submit(draft: EquationInsertOptions | ChartCreateOptions) {
    if (!capture || !view || pending || disposed) return;
    const lease = capture,
      ticket = epoch;
    if (!port.current(lease)) {
      view.setUnavailable('선택이 바뀌었습니다. 창을 다시 열어주세요.');
      return;
    }
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
    if (capture && !pending && !port.current(capture))
      view?.setUnavailable('선택이 바뀌었습니다. 창을 다시 열어주세요.');
    options.onPresentationChange?.();
  });
  return {
    presentation(kind: InlineObjectKind) {
      return pending || disposed
        ? {
            enabled: false,
            reason: pending ? '새 개체를 삽입하는 중입니다.' : '삽입 도구가 종료되었습니다.',
          }
        : port.presentation(kind);
    },
    open(kind: InlineObjectKind) {
      if (disposed || pending) return;
      if (view) {
        view.focus();
        return;
      }
      if (options.root.querySelector('dialog:modal')) {
        options.onStatus('열린 창을 먼저 닫아주세요.');
        return;
      }
      try {
        capture = port.capture(kind);
        ++epoch;
        view = createInlineObjectInsertDialog(options.root, kind, {
          onInsert: (draft) => {
            void submit(draft);
          },
          onDismiss: () => {
            if (!pending) close(true);
          },
        });
      } catch (error) {
        options.onStatus((error as Error).message);
        close();
      }
    },
    dispose() {
      disposed = true;
      unsubscribe();
      close();
    },
  };
}
