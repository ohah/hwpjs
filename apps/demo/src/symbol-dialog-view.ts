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
    recent?: readonly string[];
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
  const navigationKeys = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ]);
  const buttonIndices = new Map<HTMLButtonElement, number>();
  let buttons: HTMLButtonElement[] = [],
    tabStop: HTMLButtonElement | undefined;
  const setTabStop = (button: HTMLButtonElement) => {
    if (tabStop) tabStop.tabIndex = -1;
    button.tabIndex = 0;
    tabStop = button;
  };
  const category = doc.createElement('select'),
    grid = doc.createElement('div'),
    input = doc.createElement('input'),
    code = doc.createElement('output'),
    selected = doc.createElement('output'),
    categories = doc.createElement('label'),
    characters = doc.createElement('section'),
    buffer = doc.createElement('label'),
    recent = doc.createElement('section'),
    recentTitle = doc.createElement('span'),
    recentGrid = doc.createElement('div'),
    categoryTitle = doc.createElement('span'),
    characterTitle = doc.createElement('span'),
    bufferTitle = doc.createElement('span'),
    status = doc.createElement('p'),
    insert = doc.createElement('button'),
    cancel = doc.createElement('button');
  layer.element.classList.add('hwp-symbol-dialog');
  category.setAttribute('aria-label', '기호 범주');
  category.size = Math.min(15, SYMBOL_CATEGORIES.length);
  categories.className = 'hwp-symbol-categories';
  characters.className = 'hwp-symbol-characters';
  buffer.className = 'hwp-symbol-buffer';
  recent.className = 'hwp-symbol-recent';
  recent.dataset.role = 'symbol-recent-section';
  recentTitle.textContent = '최근 사용 문자';
  recentGrid.className = 'hwp-symbol-grid';
  recentGrid.dataset.role = 'symbol-recent';
  recentGrid.setAttribute('role', 'group');
  recentGrid.setAttribute('aria-label', '최근 사용 문자');
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
  grid.dataset.role = 'symbol-grid';
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
  const recentButtons: HTMLButtonElement[] = [];
  const refresh = () => {
    code.textContent = Array.from(
      input.value,
      (c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'),
    ).join(' ');
    insert.disabled = busy || composing || !!reason || !!symbolTextError(input.value);
    input.disabled = category.disabled = busy;
    for (const button of [...buttons, ...recentButtons]) {
      button.disabled = busy || composing;
      button.setAttribute('aria-pressed', String(button.textContent === selectedText));
    }
    status.textContent =
      reason ?? bufferError ?? (input.value ? symbolTextError(input.value) : null) ?? '';
  };
  const append = (text: string) => {
    if (busy || disposed || composing) return;
    selectedText = text;
    selected.textContent = text;
    const next = input.value + text;
    bufferError = symbolTextError(next);
    if (!bufferError) input.value = next;
    refresh();
  };
  for (const text of [...new Set(options.recent)].slice(0, 16)) {
    if (symbolTextError(text)) continue;
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', text);
    button.addEventListener('click', () => append(text));
    recentButtons.push(button);
    recentGrid.append(button);
  }
  const render = () => {
    buttonIndices.clear();
    buttons = [];
    tabStop = undefined;
    for (const child of Array.from(grid.children)) child.remove();
    const selectedCategory =
      getSymbolCategory(category.value) ?? getSymbolCategory(DEFAULT_SYMBOL_CATEGORY_ID)!;
    category.value = selectedCategory.id;
    for (const text of selectedCategory.values) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.tabIndex = buttons.length === 0 ? 0 : -1;
      if (!buttons.length) tabStop = button;
      buttonIndices.set(button, buttons.length);
      buttons.push(button);
      button.setAttribute('aria-label', text);
      button.addEventListener('focus', () => {
        if (!disposed && buttonIndices.has(button)) setTabStop(button);
      });
      button.addEventListener('keydown', (event) => {
        if (
          !navigationKeys.has(event.key) ||
          event.altKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.ctrlKey && event.key !== 'Home' && event.key !== 'End')
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const index = buttonIndices.get(button);
        if (
          disposed ||
          busy ||
          composing ||
          event.isComposing ||
          event.keyCode === 229 ||
          index === undefined
        )
          return;
        // auto-fit의 현재 첫 행을 읽어 폭 변경 뒤에도 실제 열 수를 사용한다.
        const top = buttons[0].getBoundingClientRect().top;
        const nextRow = buttons.findIndex(
          (item) => Math.abs(item.getBoundingClientRect().top - top) > 1,
        );
        const columns = nextRow < 0 ? buttons.length : nextRow;
        const rowStart = Math.floor(index / columns) * columns;
        let next = index;
        switch (event.key) {
          case 'ArrowLeft':
            next = Math.max(0, index - 1);
            break;
          case 'ArrowRight':
            next = Math.min(buttons.length - 1, index + 1);
            break;
          case 'ArrowUp':
            if (index >= columns) next = index - columns;
            break;
          case 'ArrowDown':
            if (rowStart + columns < buttons.length)
              next = Math.min(buttons.length - 1, index + columns);
            break;
          case 'Home':
            next = event.ctrlKey ? 0 : rowStart;
            break;
          case 'End':
            next = event.ctrlKey
              ? buttons.length - 1
              : Math.min(buttons.length - 1, rowStart + columns - 1);
            break;
        }
        setTabStop(buttons[next]);
        buttons[next].focus();
      });
      button.addEventListener('click', () => {
        if (!busy && !disposed && !composing && buttonIndices.has(button)) {
          setTabStop(button);
          append(text);
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
  cancel.addEventListener('click', () => {
    if (!disposed) options.onDismiss();
  });
  categories.append(categoryTitle, category);
  characters.append(characterTitle, grid, selected);
  buffer.append(bufferTitle, input, code);
  recent.append(recentTitle, recentGrid);
  characters.append(recent);
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
