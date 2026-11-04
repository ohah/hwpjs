import './table-cell-properties.css';
import { createDialogLayer } from './dialog-layer.ts';
import {
  tableCellDimensions,
  tableCellReason,
  type TableCellCapture,
  type TableCellDraft,
} from './table-cell-properties-port.ts';

export function createTableCellPropertiesView(
  root: HTMLElement,
  capture: TableCellCapture,
  callbacks: { apply: (draft: TableCellDraft) => void; dismiss: () => void },
) {
  const layer = createDialogLayer(root, {
    role: 'table-cell-properties-dialog',
    title: '표/셀 속성',
    mode: 'modal',
    onDismiss: callbacks.dismiss,
  });
  layer.body.classList.add('hwp-table-cell-properties-body');
  const doc = root.ownerDocument;
  const width = doc.createElement('input'),
    height = doc.createElement('input'),
    mode = doc.createElement('select');
  const status = doc.createElement('p'),
    note = doc.createElement('p'),
    apply = doc.createElement('button'),
    cancel = doc.createElement('button');
  let busy = false,
    composing = false,
    disposed = false,
    stale: string | null = null;
  width.type = height.type = 'text';
  width.inputMode = height.inputMode = 'decimal';
  width.value = String(capture.cell!.width / 100);
  height.value = String(capture.cell!.height / 100);
  const originalWidth = width.value,
    originalHeight = height.value;
  width.dataset.role = 'cell-width';
  height.dataset.role = 'cell-height';
  mode.dataset.role = 'cell-size-mode';
  for (const [input, label] of [
    [width, '셀 너비 (pt)'],
    [height, '셀 높이 원값 (pt)'],
    [mode, '너비 적용 범위'],
  ] as const) {
    const field = doc.createElement('label');
    field.classList.add('hwp-table-cell-properties-field');
    const caption = doc.createElement('span');
    caption.textContent = label;
    field.append(caption);
    input.setAttribute('aria-label', label);
    field.append(input);
    layer.body.append(field);
  }
  for (const [value, label] of [
    ['cell', '선택 셀만'],
    ['column', '공유 열 경계와 관련 병합 셀'],
  ] as const) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = label;
    option.disabled = value === 'column' && !capture.columnAvailable;
    mode.append(option);
  }
  mode.value = 'cell';
  note.textContent =
    '원본 셀 크기를 바꿉니다. 표시 높이는 내용의 최소 크기와 다를 수 있습니다. 셀 배경·테두리·병합/분할 편집은 연결되지 않았습니다.';
  if (!capture.columnAvailable)
    note.textContent +=
      ' 공유 열 경계: ' + tableCellReason(capture.columnReason ?? 'CellSizeBatchApiUnavailable');
  note.classList.add('hwp-table-cell-properties-hint');
  status.classList.add('hwp-table-cell-properties-status');
  status.dataset.role = 'cell-properties-status';
  status.setAttribute('role', 'status');
  apply.type = cancel.type = 'button';
  apply.textContent = '적용';
  cancel.textContent = '취소';
  apply.dataset.role = 'cell-properties-apply';
  cancel.dataset.role = 'cell-properties-cancel';
  const draft = (): TableCellDraft => ({
    widthPoints: width.value,
    heightPoints: height.value,
    mode: mode.value as TableCellDraft['mode'],
    dirty: { width: width.value !== originalWidth, height: height.value !== originalHeight },
  });
  function refresh() {
    let invalid = '';
    try {
      const size = tableCellDimensions(draft(), capture.cell!);
      if (size.width === capture.cell!.width && size.height === capture.cell!.height)
        invalid = '변경한 값이 없습니다.';
    } catch {
      invalid =
        '0 이상 pt 값으로 입력하세요. 0.01pt 단위만 허용하며 공유 열 너비는 양수여야 합니다.';
    }
    const reason =
      stale ??
      capture.writeReason ??
      (mode.value === 'column' && !capture.columnAvailable
        ? (capture.columnReason ?? 'CellSizeBatchApiUnavailable')
        : null);
    apply.disabled = disposed || busy || composing || !!reason || !!invalid;
    for (const field of [width, height, mode])
      field.disabled = busy || !!capture.writeReason || !!stale;
    status.textContent = reason ? tableCellReason(reason) : invalid;
    cancel.textContent = busy ? '닫기 (접수된 작업은 계속)' : '취소';
  }
  for (const input of [width, height, mode]) {
    input.addEventListener('input', refresh);
    input.addEventListener('change', refresh);
  }
  layer.element.addEventListener('compositionstart', () => {
    composing = true;
    refresh();
  });
  layer.element.addEventListener('compositionend', () => {
    composing = false;
    refresh();
  });
  apply.addEventListener('click', (event) => {
    if (!disposed && !apply.disabled && !(event as any).isComposing) callbacks.apply(draft());
  });
  cancel.addEventListener('click', callbacks.dismiss);
  layer.body.append(note, status);
  layer.footer.append(apply, cancel);
  refresh();
  layer.show(width);
  return {
    focus: () => width.focus(),
    setBusy(value: boolean) {
      busy = value;
      refresh();
    },
    setStale(value: string) {
      stale = value;
      refresh();
    },
    setStatus(value: string) {
      status.textContent = value;
    },
    destroy() {
      disposed = true;
      layer.destroy();
    },
  };
}
export type TableCellPropertiesView = ReturnType<typeof createTableCellPropertiesView>;
