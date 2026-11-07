import './table-cell-properties.css';
import { createDialogLayer } from './dialog-layer.ts';
import { createCellSizeUnitDraft, type CellSizeUnit } from './table-cell-size-units.ts';
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
  layer.element.classList.add('hwp-table-cell-properties-dialog');
  layer.body.classList.add('hwp-table-cell-properties-body');
  const doc = root.ownerDocument;
  const width = doc.createElement('input'),
    height = doc.createElement('input'),
    mode = doc.createElement('select'),
    unit = doc.createElement('select');
  const status = doc.createElement('p'),
    note = doc.createElement('p'),
    apply = doc.createElement('button'),
    cancel = doc.createElement('button'),
    unitNote = doc.createElement('p');
  const sizes = createCellSizeUnitDraft(capture.cell!);
  let unitBlocked = false;
  let busy = false,
    composing = false,
    disposed = false,
    stale: string | null = null;
  width.type = height.type = 'text';
  width.inputMode = height.inputMode = 'decimal';
  width.value = sizes.read().width;
  height.value = sizes.read().height;
  width.dataset.role = 'cell-width';
  height.dataset.role = 'cell-height';
  mode.dataset.role = 'cell-size-mode';
  unit.dataset.role = 'cell-size-unit';
  for (const value of ['mm', 'pt']) {
    const option = doc.createElement('option');
    option.value = option.textContent = value;
    unit.append(option);
  }
  unit.value = 'mm';
  const dimensions = doc.createElement('fieldset'),
    legend = doc.createElement('legend');
  dimensions.className = 'hwp-table-cell-properties-group';
  legend.textContent = '셀 크기';
  dimensions.append(legend);
  layer.body.append(dimensions);
  const captions = new Map<HTMLElement, HTMLElement>();
  for (const [input, label] of [
    [unit, '단위'],
    [width, '셀 너비 (mm)'],
    [height, '셀 높이 (mm)'],
    [mode, '너비 적용 범위'],
  ] as const) {
    const field = doc.createElement('label');
    field.classList.add('hwp-table-cell-properties-field');
    const caption = doc.createElement('span');
    caption.textContent = label;
    field.append(caption);
    captions.set(input, caption);
    if (input === unit) field.classList.add('hwp-table-cell-properties-unit');
    input.setAttribute('aria-label', label);
    field.append(input);
    dimensions.append(field);
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
  unitNote.textContent = 'mm 값은 문서의 최소 단위로 반올림됩니다.';
  unitNote.dataset.role = 'cell-size-unit-note';
  unitNote.classList.add('hwp-table-cell-properties-hint');
  dimensions.append(unitNote);
  note.textContent = '셀 높이는 내용에 따라 지정한 값보다 늘어날 수 있습니다.';
  if (!capture.columnAvailable)
    note.textContent +=
      ' 공유 열 경계: ' + tableCellReason(capture.columnReason ?? 'CellSizeBatchApiUnavailable');
  note.classList.add('hwp-table-cell-properties-hint');
  status.classList.add('hwp-table-cell-properties-status');
  status.dataset.role = 'cell-properties-status';
  status.setAttribute('role', 'status');
  apply.type = cancel.type = 'button';
  apply.textContent = '확인';
  cancel.textContent = '취소';
  apply.dataset.role = 'cell-properties-apply';
  cancel.dataset.role = 'cell-properties-cancel';
  const draft = (): TableCellDraft => ({
    ...sizes.points(),
    mode: mode.value as TableCellDraft['mode'],
  });
  const blocked = () => disposed || busy || !!capture.writeReason || !!stale;
  function refresh() {
    const selectedUnit = sizes.read().unit;
    for (const [field, label] of [
      [width, '셀 너비'],
      [height, '셀 높이'],
    ] as const) {
      const caption = `${label} (${selectedUnit})`;
      captions.get(field)!.textContent = caption;
      field.setAttribute('aria-label', caption);
    }
    unitNote.hidden = selectedUnit !== 'mm';
    let invalid = '';
    try {
      const size = tableCellDimensions(draft(), capture.cell!);
      if (size.width === capture.cell!.width && size.height === capture.cell!.height)
        invalid = '변경한 값이 없습니다.';
    } catch {
      invalid = unitBlocked
        ? '단위를 바꾸기 전에 올바른 크기를 입력하세요.'
        : `0 이상 ${selectedUnit} 값으로 입력하세요. 0.01${selectedUnit} 단위만 허용하며 공유 열 너비는 양수여야 합니다.`;
    }
    const reason =
      stale ??
      capture.writeReason ??
      (mode.value === 'column' && !capture.columnAvailable
        ? (capture.columnReason ?? 'CellSizeBatchApiUnavailable')
        : null);
    apply.disabled = disposed || busy || composing || !!reason || !!invalid;
    for (const field of [width, height, mode]) field.disabled = blocked();
    unit.disabled = blocked() || composing;
    status.textContent = reason ? tableCellReason(reason) : invalid;
    cancel.textContent = busy ? '닫기 (접수된 작업은 계속)' : '취소';
  }
  for (const [axis, input] of [
    ['width', width],
    ['height', height],
  ] as const) {
    const edit = () => {
      if (blocked()) return;
      sizes.edit(axis, input.value);
      unitBlocked = false;
      refresh();
    };
    input.addEventListener('input', edit);
    input.addEventListener('change', edit);
  }
  for (const event of ['input', 'change']) mode.addEventListener(event, refresh);
  unit.addEventListener('change', (event) => {
    if (blocked() || composing || (event as any).isComposing) {
      unit.value = sizes.read().unit;
      return;
    }
    let valid = true;
    try {
      tableCellDimensions(draft(), capture.cell!);
    } catch {
      valid = false;
    }
    if (!valid || !sizes.changeUnit(unit.value as CellSizeUnit)) {
      unitBlocked = true;
      unit.value = sizes.read().unit;
    } else {
      unitBlocked = false;
      width.value = sizes.read().width;
      height.value = sizes.read().height;
    }
    refresh();
  });
  layer.element.addEventListener('compositionstart', () => {
    composing = true;
    refresh();
  });
  layer.element.addEventListener('compositionend', () => {
    composing = false;
    if (!blocked()) {
      sizes.edit('width', width.value);
      sizes.edit('height', height.value);
      unitBlocked = false;
    }
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
