import type { HeadlessEditor } from '@hwpjs/core';
import {
  createCreatedCellPropertiesPort,
  type CreatedCellPropertiesHost,
} from './created-cell-properties-port.ts';
import { createCreatedCellPropertiesView } from './created-cell-properties-view.ts';
/** Generated owners never enter the original-cell controller's three-node comparison. */
export function createCreatedCellPropertiesTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  getHost(): CreatedCellPropertiesHost | undefined;
  onStatus(value: string): void;
  onClose(): void;
}) {
  const port = createCreatedCellPropertiesPort(options.editor, options.getHost);
  let view: ReturnType<typeof createCreatedCellPropertiesView> | undefined,
    selected: ReturnType<typeof port.capture> | undefined;
  let pending = false,
    disposed = false,
    epoch = 0;
  const close = () => {
    epoch++;
    view?.destroy();
    view = undefined;
    selected = undefined;
  };
  const unsubscribe = options.editor.registerStateListener(() => {
    if (view && selected && !port.isCurrent(selected)) view.setStale();
  });
  return {
    presentation() {
      try {
        port.capture();
        const enabled = !pending && !disposed;
        return { enabled, surfaceSelection: enabled };
      } catch {
        return { enabled: false, reason: '생성 표의 현재 셀을 선택하세요.' };
      }
    },
    open() {
      if (disposed || pending) return;
      if (view) {
        view.focus();
        return;
      }
      if (options.root.querySelector('dialog:modal')) return;
      let captured: ReturnType<typeof port.capture>;
      try {
        captured = port.capture();
      } catch {
        options.onStatus('생성 표 셀을 다시 선택하세요.');
        return;
      }
      selected = captured;
      const ticket = ++epoch;
      const available =
        (captured.state.capabilities as any)?.createdCellPropertiesAvailable === true &&
        (captured.state.content as any)?.createdCellPropertiesAvailable === true;
      view = createCreatedCellPropertiesView(
        options.root,
        captured.expected,
        {
          dismiss() {
            close();
            options.onClose();
          },
          async apply(patch) {
            if (pending || ticket !== epoch || selected !== captured || !view) return;
            pending = true;
            view.setBusy(true);
            try {
              const result = await port.apply(captured, patch);
              if (disposed || ticket !== epoch) return;
              if (result.status === 'known-no-op' || result.status.startsWith('committed')) {
                close();
                options.onStatus(
                  result.status === 'committed-refresh-required'
                    ? '셀 변경이 반영됐습니다. 표시를 확인한 뒤 계속하세요.'
                    : '셀 속성 요청을 처리했습니다.',
                );
              } else
                view?.setStatus(
                  'error' in result ? String(result.error) : '셀 속성을 적용하지 못했습니다.',
                );
            } catch (cause) {
              if (!disposed && ticket === epoch)
                view?.setStatus(
                  cause instanceof Error
                    ? cause.message
                    : '결과를 확인한 뒤 계속하세요. 같은 요청을 다시 적용하지 마세요.',
                );
            } finally {
              pending = false;
              if (!disposed && ticket === epoch) view?.setBusy(false);
            }
          },
        },
        available
          ? null
          : '현재 엔진에는 생성 셀 크기·테두리·채우기 쓰기가 아직 연결되지 않았습니다.',
        {
          value: captured.verticalAlignment,
          writable:
            available &&
            (captured.state.capabilities as any)?.createdCellVerticalAlignmentAvailable === true &&
            (captured.state.content as any)?.createdCellVerticalAlignmentAvailable === true,
        },
      );
      if (!port.bindDialog(captured, view.element)) {
        close();
        options.onStatus('생성 셀의 대화상자 소유권을 확인하지 못했습니다. 셀을 다시 선택하세요.');
      }
    },
    dispose() {
      disposed = true;
      unsubscribe();
      close();
      port.dispose();
    },
  };
}
