import { createDialogLayer } from './dialog-layer.ts';
import { SYMBOL_CATEGORIES, symbolTextError } from './symbol-catalog.ts';
import './symbol-dialog.css';

export function createSymbolDialog(
  root: HTMLElement,
  options: {
    onInsert: (text: string) => void;
    onDismiss: () => void;
  },
) {
  const layer = createDialogLayer(root, {
    role: 'symbol-dialog',
    title: '문자표',
    mode: 'modal',
    onDismiss: options.onDismiss,
  });
  const doc = root.ownerDocument;
  const category = doc.createElement('select'),
    grid = doc.createElement('div'),
    input = doc.createElement('input'),
    code = doc.createElement('output'),
    status = doc.createElement('p'),
    insert = doc.createElement('button'),
    cancel = doc.createElement('button');
  layer.element.classList.add('hwp-symbol-dialog');
  category.setAttribute('aria-label', '기호 범주');
  category.dataset.role = 'symbol-category';
  grid.className = 'hwp-symbol-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', '기호 선택');
  input.setAttribute('aria-label', '넣을 문자');
  input.dataset.role = 'symbol-text';
  input.maxLength = 64;
  input.value = '※';
  code.dataset.role = 'symbol-codepoints';
  status.dataset.role = 'symbol-status';
  status.setAttribute('role', 'status');
  insert.type = cancel.type = 'button';
  insert.textContent = '넣기';
  cancel.textContent = '취소';
  insert.dataset.role = 'symbol-insert';
  cancel.dataset.role = 'symbol-cancel';
  let busy = false,
    reason: string | null = null,
    composing = false,
    disposed = false;
  const refresh = () => {
    code.textContent = Array.from(
      input.value,
      (c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'),
    ).join(' ');
    insert.disabled = busy || composing || !!reason || !!symbolTextError(input.value);
    input.disabled = category.disabled = busy;
    for (const button of grid.querySelectorAll<HTMLButtonElement>('button')) button.disabled = busy;
    status.textContent = reason ?? symbolTextError(input.value) ?? '';
  };
  const render = () => {
    for (const child of Array.from(grid.children)) child.remove();
    const selected = SYMBOL_CATEGORIES[Number(category.value)] ?? SYMBOL_CATEGORIES[0];
    for (const text of selected.values) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-label', text);
      button.addEventListener('click', () => {
        if (!busy && !disposed) {
          input.value = text;
          refresh();
        }
      });
      grid.append(button);
    }
    refresh();
  };
  for (const [index, item] of SYMBOL_CATEGORIES.entries()) {
    const option = doc.createElement('option');
    option.value = String(index);
    option.textContent = item.label;
    category.append(option);
  }
  category.value = '0';
  category.addEventListener('change', render);
  input.addEventListener('input', refresh);
  layer.element.addEventListener('compositionstart', () => {
    composing = true;
    refresh();
  });
  layer.element.addEventListener('compositionend', () => {
    composing = false;
    refresh();
  });
  layer.element.addEventListener(
    'keydown',
    (event) => {
      if (
        (composing || event.isComposing || event.keyCode === 229) &&
        ['Enter', 'Escape'].includes(event.key)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  layer.element.addEventListener(
    'cancel',
    (event) => {
      if (composing) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  insert.addEventListener('click', () => {
    if (!disposed && !insert.disabled && !composing) options.onInsert(input.value);
  });
  cancel.addEventListener('click', options.onDismiss);
  layer.body.append(category, grid, input, code, status);
  layer.footer.append(insert, cancel);
  render();
  layer.show(category);
  return {
    element: layer.element,
    focus() {
      category.focus();
    },
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
