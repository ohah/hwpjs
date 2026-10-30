import { createDialogLayer } from './dialog-layer.ts';
import { tableInsertDimensions, type TableInsertDraft } from './table-insert-bridge.ts';
export function createTableInsertDialog(
  root: HTMLElement,
  options: { onInsert: (draft: TableInsertDraft) => void; onDismiss: () => void },
) {
  const layer = createDialogLayer(root, {
    role: 'table-insert-dialog',
    title: '표 만들기',
    mode: 'modal',
    onDismiss: options.onDismiss,
  });
  const doc = root.ownerDocument,
    fields = {} as Record<keyof TableInsertDraft, HTMLInputElement>;
  for (const [key, label, value] of [
    ['rows', '줄 수', '2'],
    ['columns', '칸 수', '2'],
    ['widthPoints', '표 너비 (pt)', '360'],
    ['rowHeightPoints', '한 줄 높이 (pt)', '18'],
  ] as const) {
    const row = doc.createElement('label'),
      input = doc.createElement('input');
    row.textContent = label;
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = value;
    input.dataset.role = 'table-' + key;
    input.setAttribute('aria-label', label);
    row.append(input);
    layer.body.append(row);
    fields[key] = input;
  }
  const note = doc.createElement('p'),
    status = doc.createElement('p'),
    insert = doc.createElement('button'),
    cancel = doc.createElement('button');
  note.textContent =
    '본문 커서 위치에 표를 넣습니다. 새 표 자동 선택과 셀 편집은 연결되지 않았습니다.';
  status.dataset.role = 'table-status';
  status.setAttribute('role', 'status');
  insert.type = cancel.type = 'button';
  insert.textContent = '만들기';
  cancel.textContent = '취소';
  insert.dataset.role = 'table-insert';
  cancel.dataset.role = 'table-cancel';
  let busy = false,
    composing = false,
    disposed = false,
    reason: string | null = null;
  const draft = (): TableInsertDraft => ({
    rows: fields.rows.value,
    columns: fields.columns.value,
    widthPoints: fields.widthPoints.value,
    rowHeightPoints: fields.rowHeightPoints.value,
  });
  const refresh = () => {
    let invalid: string | null = null;
    try {
      tableInsertDimensions(draft());
    } catch {
      invalid = '줄·칸은 양의 정수, 크기는 양의 pt 값(소수 둘째 자리까지)으로 입력하세요.';
    }
    insert.disabled = busy || composing || !!reason || !!invalid;
    cancel.textContent = busy ? '닫기 (삽입은 계속)' : '취소';
    for (const input of Object.values(fields)) input.disabled = busy;
    status.textContent = reason ?? invalid ?? '';
  };
  for (const input of Object.values(fields)) input.addEventListener('input', refresh);
  layer.element.addEventListener('compositionstart', () => {
    composing = true;
    refresh();
  });
  layer.element.addEventListener('compositionend', () => {
    composing = false;
    refresh();
  });
  insert.addEventListener('click', () => {
    if (!disposed && !insert.disabled) options.onInsert(draft());
  });
  cancel.addEventListener('click', options.onDismiss);
  layer.body.append(note, status);
  layer.footer.append(insert, cancel);
  refresh();
  layer.show(fields.rows);
  return {
    focus: () => fields.rows.focus(),
    setAvailability(value: string | null) {
      reason = value;
      refresh();
    },
    setBusy(value: boolean) {
      busy = value;
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
