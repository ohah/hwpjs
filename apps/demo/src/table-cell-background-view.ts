import { createDialogLayer } from './dialog-layer.ts';
import {
  tableCellBackgroundReason,
  type TableCellBackgroundCapture,
  type TableCellBackgroundDraft,
} from './table-cell-background-port.ts';
// @ts-ignore Existing RGB validator is the sole hex parser.
import { parseCharacterColor } from '../../../js/character-color-args.mjs';
import './table-cell-background.css';

export function createTableCellBackgroundView(
  root: HTMLElement,
  capture: TableCellBackgroundCapture,
  callbacks: { apply: (draft: TableCellBackgroundDraft) => void; dismiss: () => void },
) {
  let disposed = false,
    composing = false,
    busy = false,
    stale: string | null = null,
    dirty = false;
  const dismiss = () => {
    if (!disposed && !composing) callbacks.dismiss();
  };
  const layer = createDialogLayer(root, {
    role: 'table-cell-background-dialog',
    title: '셀 배경',
    mode: 'modal',
    onDismiss: dismiss,
  });
  layer.body.classList.add('hwp-cell-background-body');
  const doc = root.ownerDocument,
    current = doc.createElement('p'),
    label = doc.createElement('label');
  const color = doc.createElement('input'),
    hex = doc.createElement('input'),
    status = doc.createElement('p');
  const apply = doc.createElement('button'),
    cancel = doc.createElement('button');
  current.dataset.role = 'cell-background-current';
  current.textContent = '현재 배경: 미관측';
  label.textContent = '새 배경색';
  color.type = 'color';
  color.value = '#000000';
  color.dataset.role = 'cell-background-color';
  color.setAttribute('aria-label', '새 배경색 선택');
  hex.type = 'text';
  hex.value = '';
  hex.placeholder = '#RRGGBB';
  hex.maxLength = 7;
  hex.dataset.role = 'cell-background-hex';
  hex.setAttribute('aria-label', '새 배경색 RGB 값');
  label.append(color, hex);
  status.dataset.role = 'cell-background-status';
  status.setAttribute('role', 'status');
  apply.type = cancel.type = 'button';
  apply.textContent = '적용';
  cancel.textContent = '취소';
  apply.dataset.role = 'cell-background-apply';
  cancel.dataset.role = 'cell-background-cancel';
  function refresh() {
    const reason =
      stale ?? (capture.writeReason ? tableCellBackgroundReason(capture.writeReason) : null);
    const invalid = !dirty
      ? '적용할 배경색을 직접 선택하세요.'
      : parseCharacterColor(hex.value) === null
        ? '#RRGGBB 형식의 단색을 선택하세요.'
        : '';
    apply.disabled = disposed || composing || busy || !!reason || !!invalid;
    color.disabled = hex.disabled = disposed || busy || !!reason;
    status.textContent = reason ?? invalid;
    cancel.textContent = busy ? '닫기 (접수된 작업은 계속)' : '취소';
  }
  for (const type of ['input', 'change']) {
    color.addEventListener(type, () => {
      if (disposed || color.disabled) return;
      dirty = true;
      hex.value = color.value;
      refresh();
    });
    hex.addEventListener(type, () => {
      if (disposed || hex.disabled) return;
      dirty = true;
      if (parseCharacterColor(hex.value) !== null) color.value = hex.value;
      refresh();
    });
  }
  layer.element.addEventListener('compositionstart', () => {
    if (!disposed) {
      composing = true;
      refresh();
    }
  });
  layer.element.addEventListener('compositionend', () => {
    if (!disposed) {
      composing = false;
      refresh();
    }
  });
  apply.addEventListener('click', (event) => {
    if (
      !disposed &&
      !composing &&
      !apply.disabled &&
      !('isComposing' in event && event.isComposing === true)
    )
      callbacks.apply({ color: hex.value, dirty });
  });
  cancel.addEventListener('click', dismiss);
  layer.body.append(current, label, status);
  layer.footer.append(apply, cancel);
  refresh();
  layer.show(hex);
  return {
    focus() {
      if (!disposed) hex.focus();
    },
    setBusy(value: boolean) {
      if (!disposed) {
        busy = value;
        refresh();
      }
    },
    setStale(value: string) {
      if (!disposed) {
        stale = value;
        refresh();
      }
    },
    setStatus(value: string) {
      if (!disposed) status.textContent = value;
    },
    destroy() {
      if (!disposed) {
        disposed = true;
        layer.destroy();
      }
    },
  };
}
export type TableCellBackgroundView = ReturnType<typeof createTableCellBackgroundView>;
