import { createDialogLayer } from './dialog-layer.ts';
import {
  SYMBOL_CATEGORIES,
  DEFAULT_SYMBOL_CATEGORY_ID,
  getSymbolCategory,
  symbolTextError,
} from './symbol-catalog.ts';
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
    selected = doc.createElement('output'),
    categories = doc.createElement('label'),
    characters = doc.createElement('section'),
    buffer = doc.createElement('label'),
    categoryTitle = doc.createElement('span'),
    characterTitle = doc.createElement('span'),
    bufferTitle = doc.createElement('span'),
    status = doc.createElement('p'),
    insert = doc.createElement('button'),
    cancel = doc.createElement('button');
  layer.element.classList.add('hwp-symbol-dialog');
  category.setAttribute('aria-label', '기호 범주');
  category.size = Math.min(12, SYMBOL_CATEGORIES.length);
  categories.className = 'hwp-symbol-categories';
  characters.className = 'hwp-symbol-characters';
  buffer.className = 'hwp-symbol-buffer';
  categoryTitle.textContent = '문자 영역';
  characterTitle.textContent = '문자 선택';
  bufferTitle.textContent = '입력 문자';
  selected.dataset.role = 'symbol-selected';
  selected.setAttribute('aria-label', '선택한 문자');
  selected.setAttribute('aria-live', 'polite');
  category.dataset.role = 'symbol-category';
  grid.className = 'hwp-symbol-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', '기호 선택');
  input.setAttribute('aria-label', '넣을 문자');
  input.dataset.role = 'symbol-text';
  input.maxLength = 64;
  input.value = '';
  input.autocomplete = 'off';
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
    disposed = false,
    selectedText = '',
    bufferError: string | null = null;
  const refresh = () => {
    code.textContent = Array.from(
      input.value,
      (c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'),
    ).join(' ');
    insert.disabled = busy || composing || !!reason || !!symbolTextError(input.value);
    input.disabled = category.disabled = busy;
    for (const button of grid.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = busy || composing;
      button.setAttribute('aria-pressed', String(button.textContent === selectedText));
    }
    status.textContent =
      reason ?? bufferError ?? (input.value ? symbolTextError(input.value) : null) ?? '';
  };
  const render = () => {
    for (const child of Array.from(grid.children)) child.remove();
    const selectedCategory =
      getSymbolCategory(category.value) ?? getSymbolCategory(DEFAULT_SYMBOL_CATEGORY_ID)!;
    category.value = selectedCategory.id;
    for (const text of selectedCategory.values) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-label', text);
      button.addEventListener('click', () => {
        if (!busy && !disposed && !composing) {
          selectedText = text;
          selected.textContent = text;
          const next = input.value + text;
          bufferError = symbolTextError(next);
          if (!bufferError) input.value = next;
          refresh();
        }
      });
      grid.append(button);
    }
    refresh();
  };
  for (const item of SYMBOL_CATEGORIES) {
    const option = doc.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    category.append(option);
  }
  category.value = DEFAULT_SYMBOL_CATEGORY_ID;
  category.addEventListener('change', render);
  input.addEventListener('input', () => {
    bufferError = null;
    refresh();
  });
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
  categories.append(categoryTitle, category);
  characters.append(characterTitle, grid, selected);
  buffer.append(bufferTitle, input, code);
  layer.body.append(categories, characters, buffer, status);
  layer.footer.append(insert, cancel);
  render();
  layer.show(input);
  return {
    element: layer.element,
    focus() {
      input.focus();
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
