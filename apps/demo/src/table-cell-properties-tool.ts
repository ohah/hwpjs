import type { HeadlessEditor, OriginalCellAlignment } from '@hwpjs/core';
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
  onAppearance?: () => void;
  appearanceAvailable?: () => boolean;
  createView?: typeof createTableCellPropertiesView;
}) {
  let disposed = false,
    opening = false,
    pending = false,
    epoch = 0;
  type VerticalCapture = Extract<
    Awaited<ReturnType<TableCellPropertiesPort['captureVerticalAlignment']>>,
    { state: 'available' }
  >['capture'];
  type BlockCapture = Extract<
    Awaited<ReturnType<TableCellPropertiesPort['readAlignmentBlock']>>,
    { state: 'available' }
  >['capture'];
  let view: TableCellPropertiesView | undefined,
    captured: TableCellCapture | undefined,
    verticalCaptured: VerticalCapture | BlockCapture | undefined;
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
    verticalCaptured = undefined;
    opening = false;
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
  async function submit(draft: TableCellDraft | { verticalAlignment: OriginalCellAlignment }) {
    if (disposed || pending || !view || !captured) return;
    const alignment = 'verticalAlignment' in draft;
    const verticalLease = verticalCaptured;
    if (alignment && !verticalLease) return;
    const lease = captured,
      ticket = epoch,
      currentView = view;
    pending = true;
    currentView.setBusy(true);
    options.onPresentationChange?.();
    try {
      const result = alignment
        ? await options.port.applyVerticalAlignment(verticalLease!, draft.verticalAlignment)
        : await options.port.apply(lease, draft);
      if (disposed || ticket !== epoch || !sameDocument(lease, options.port.capture())) return;
      const status = 'status' in result && typeof result.status === 'string' ? result.status : '';
      if (status.startsWith('committed')) {
        const block = verticalLease && 'cellCount' in verticalLease;
        const restored = block ? false : await options.port.restoreSelection(lease, result);
        if (disposed || ticket !== epoch || !sameDocument(lease, options.port.capture())) return;
        close(false);
        const completed = epoch;
        options.onStatus(
          status === 'committed-with-snapshot'
            ? (alignment ? '셀 세로 정렬을 적용했습니다.' : '셀 크기를 적용했습니다.') +
                (restored || block ? '' : ' 커서 위치를 다시 선택해주세요.')
            : (alignment ? '정렬은' : '크기는') +
                ' 반영됐지만 표시 확인이 필요합니다. 다시 적용하지 마세요.',
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
      else if (alignment) {
        // The retained Native alignment lease is single-use even on refusal.
        close(false);
        options.onStatus('세로 정렬을 적용하지 못했습니다. 셀을 확인하고 속성을 다시 열어주세요.');
      } else
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
      if (disposed || pending || opening) return;
      if (view) {
        view.focus();
        return;
      }
      if (options.root.querySelector('dialog:modal')) {
        options.onStatus('열린 대화상자를 먼저 닫아주세요.');
        return;
      }
      const lease = options.port.capture();
      const selection = options.port.captureAlignmentBlockSelection();
      if (selection) {
        captured = lease;
        const ticket = ++epoch;
        opening = true;
        void options.port
          .readAlignmentBlock(selection)
          .then((read) => {
            if (disposed || ticket !== epoch) return;
            if (read.state !== 'available' || !selection.current()) {
              close(false);
              options.onStatus('선택한 셀의 세로 정렬을 변경할 수 없습니다.');
              return;
            }
            const block = read.capture;
            verticalCaptured = block;
            let bound = false;
            view = (options.createView ?? createTableCellPropertiesView)(options.root, lease, {
              apply() {},
              dismiss: () => close(true),
              verticalAlignment: {
                value: block.value,
                cellCount: block.cellCount,
                prepareDialog(element) {
                  if (!selection.prepareDialog(element))
                    throw Error('StaleOriginalCellAlignmentBlock');
                },
                bindDialog(element) {
                  bound = options.port.bindVerticalAlignmentDialog(block, element);
                  return bound;
                },
                apply(value) {
                  if (bound) void submit({ verticalAlignment: value });
                },
              },
            });
            opening = false;
          })
          .catch(() => {
            if (!disposed && ticket === epoch) {
              close(false);
              options.onStatus('선택한 셀의 속성을 다시 열어주세요.');
            }
          });
        return;
      }
      if (lease.reason || !lease.cell) {
        options.onStatus(lease.reason ? tableCellReason(lease.reason) : '표 셀을 선택하세요.');
        return;
      }
      captured = lease;
      const ticket = ++epoch;
      const mount = (vertical?: VerticalCapture) => {
        if (disposed || ticket !== epoch || !options.port.isCurrent(lease)) {
          if (ticket === epoch) close(false);
          return;
        }
        const selector = vertical?.selector;
        verticalCaptured =
          vertical &&
          vertical.state === lease.state &&
          selector?.section === lease.cell?.section &&
          selector?.tableNode === lease.cell?.tableNode &&
          selector?.listNode === lease.cell?.listNode &&
          selector?.paragraph === lease.target?.paragraph &&
          (vertical.value === null || ['TOP', 'CENTER', 'BOTTOM'].includes(vertical.value))
            ? vertical
            : undefined;
        let bound = false;
        view = (options.createView ?? createTableCellPropertiesView)(options.root, lease, {
          verticalAlignment: verticalCaptured
            ? {
                value: verticalCaptured.value,
                bindDialog: (element) => {
                  bound = options.port.bindVerticalAlignmentDialog(verticalCaptured!, element);
                  return bound;
                },
                apply: (value) => {
                  if (bound && ['TOP', 'CENTER', 'BOTTOM'].includes(value))
                    void submit({ verticalAlignment: value });
                },
              }
            : undefined,
          apply: (draft) => {
            void submit(draft);
          },
          dismiss: () => close(true),
          appearanceEnabled: options.appearanceAvailable?.() ?? false,
          appearance: options.onAppearance
            ? () => {
                if (disposed || pending || captured !== lease || !options.port.isCurrent(lease))
                  return;
                // Close this modal before the existing appearance tool recaptures its own owner.
                close(false);
                options.onAppearance?.();
              }
            : undefined,
        });
        opening = false;
      };
      // Capability is discovery only; the independent Native capture and bound
      // modal supply authority. Keep unsupported existing size dialogs synchronous.
      const capabilities = lease.state.capabilities;
      if (
        capabilities !== null &&
        typeof capabilities === 'object' &&
        'originalCellVerticalAlignmentAvailable' in capabilities &&
        capabilities.originalCellVerticalAlignmentAvailable === true
      ) {
        opening = true;
        void options.port
          .captureVerticalAlignment()
          .then(
            (read) => {
              mount(read.state === 'available' ? read.capture : undefined);
            },
            () => mount(),
          )
          .catch(() => {
            if (!disposed && ticket === epoch) {
              close(false);
              options.onStatus('셀 속성 창을 열지 못했습니다. 현재 셀을 다시 선택해주세요.');
            }
          });
      } else mount();
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
  onAppearance?: () => void;
  appearanceAvailable?: () => boolean;
}) {
  return createTableCellPropertiesController({
    ...options,
    port: createTableCellPropertiesPort(options.editor, options.core),
  });
}
