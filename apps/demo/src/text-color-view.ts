import { createDialogLayer } from './dialog-layer.ts';
import './text-color.css';

export interface TextColorViewState {
  value: string | 'mixed' | null;
  reason: string | null;
  draft: string;
  pending: boolean;
  stale: boolean;
  error: string | null;
  canApply: boolean;
}
export interface TextColorView {
  update(state: TextColorViewState): void;
  show(): void;
  dispose(): void;
  isComposing(): boolean;
}
export function createTextColorView(
  root: HTMLElement,
  callbacks: { onInput(value: string): void; onApply(): void; onCancel(): void },
): TextColorView {
  const doc = root.ownerDocument;
  let composing = false;
  const dismiss = () => {
    if (!composing) callbacks.onCancel();
  };
  const layer = createDialogLayer(root, {
    role: 'text-color-dialog',
    title: '글자 색',
    mode: 'modal',
    onDismiss: dismiss,
  });
  layer.element.classList.add('hwp-text-color-dialog');
  const current = doc.createElement('p'),
    label = doc.createElement('label'),
    input = doc.createElement('input'),
    palette = doc.createElement('div'),
    status = doc.createElement('p'),
    apply = doc.createElement('button'),
    cancel = doc.createElement('button');
  current.dataset.role = 'text-color-current';
  input.type = 'text';
  input.maxLength = 7;
  input.dataset.role = 'text-color-input';
  input.setAttribute('aria-label', '글자 색 RGB 값');
  input.placeholder = '#RRGGBB';
  label.append(doc.createTextNode('색 값 '), input);
  palette.className = 'hwp-text-color-palette';
  palette.setAttribute('aria-label', '표준색');
  const swatches: HTMLButtonElement[] = [];
  for (const color of [
    '#000000',
    '#ffffff',
    '#ff0000',
    '#ffff00',
    '#00ff00',
    '#00ffff',
    '#0000ff',
    '#ff00ff',
    '#808080',
    '#800000',
    '#808000',
    '#008000',
    '#008080',
    '#000080',
    '#800080',
    '#c0c0c0',
  ]) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.style.backgroundColor = color;
    button.setAttribute('aria-label', `색 ${color}`);
    button.dataset.color = color;
    button.addEventListener('click', () => {
      input.value = color;
      callbacks.onInput(color);
    });
    swatches.push(button);
    palette.append(button);
  }
  status.dataset.role = 'text-color-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  apply.type = cancel.type = 'button';
  apply.textContent = '적용';
  cancel.textContent = '취소';
  apply.dataset.role = 'text-color-apply';
  cancel.dataset.role = 'text-color-cancel';
  apply.addEventListener('click', () => {
    if (!composing) callbacks.onApply();
  });
  cancel.addEventListener('click', dismiss);
  input.addEventListener('input', () => callbacks.onInput(input.value));
  layer.element.addEventListener('compositionstart', () => {
    composing = true;
  });
  layer.element.addEventListener('compositionend', () => {
    composing = false;
  });
  layer.element.addEventListener('keydown', (event) => {
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && event.target === input && !apply.disabled) {
      event.preventDefault();
      callbacks.onApply();
    }
  });
  layer.body.append(current, label, palette, status);
  layer.footer.append(apply, cancel);
  return {
    update(state) {
      current.textContent =
        state.value === 'mixed'
          ? '현재 글자색: 혼합'
          : state.value === null
            ? '현재 글자색: 알 수 없음'
            : `현재 글자색: ${state.value}`;
      if (input.value !== state.draft) input.value = state.draft;
      const disabled = state.pending || state.stale || state.reason !== null;
      input.disabled = disabled;
      for (const button of swatches) button.disabled = disabled;
      apply.disabled = !state.canApply;
      cancel.disabled = state.pending;
      const dismissButton = layer.element.querySelector<HTMLButtonElement>(
        '[data-role=dialog-dismiss]',
      );
      if (dismissButton) dismissButton.disabled = state.pending;
      input.setAttribute('aria-invalid', String(state.error === 'InvalidCharacterColor'));
      status.dataset.reason = state.reason ?? '';
      status.textContent = state.stale
        ? '문서나 선택이 바뀌었습니다. 창을 닫고 다시 열어주세요.'
        : (state.error ??
          (state.reason === 'EmptyCharacterSelection'
            ? '글자 범위를 선택해주세요.'
            : state.reason === 'SelectionNotEditable' || state.reason === 'ReadOnlyDocument'
              ? '이 선택은 변경할 수 없습니다.'
              : state.reason
                ? '현재 선택에는 글자색을 적용할 수 없습니다.'
                : state.value === null
                  ? '색을 직접 지정하면 선택한 글자색을 바꿉니다.'
                  : ''));
    },
    show() {
      layer.show(input.disabled ? cancel : input);
    },
    dispose() {
      layer.destroy();
    },
    isComposing: () => composing,
  };
}
