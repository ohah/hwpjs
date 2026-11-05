import { fontLanguageLabels as labels, fontNameLabel } from './formatting-observation-label.ts';
export { fontNameLabel } from './formatting-observation-label.ts';
import type { CharacterFontLanguage, CharacterFontNameValue } from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
import './font-name.css';
export interface FontNameViewState {
  languages: readonly CharacterFontLanguage[];
  values: Readonly<Record<CharacterFontLanguage, CharacterFontNameValue>>;
  reasons: Readonly<Record<CharacterFontLanguage, string | null>>;
  language: CharacterFontLanguage | 'representative' | null;
  representativeReason?: string | null;
  draft: string;
  suggestions: readonly string[];
  pending: boolean;
  refreshRequired: boolean;
  reopenRequired?: boolean;
  stale: boolean;
  error: string | null;
  canApply: boolean;
}
export interface FontNameView {
  getDialogElement?(): HTMLDialogElement;
  update(state: FontNameViewState): void;
  show(): void;
  dispose(): void;
  isComposing(): boolean;
}
function reasonText(reason: string | null) {
  if (!reason) return '';
  if (reason === 'SurfaceFormattingSettlementUnknown')
    return '요청 결과를 확인하지 못했습니다. 반영 여부를 확인한 뒤 창을 다시 열어주세요.';
  if (reason === 'SurfaceFormattingCurrentUnknown')
    return '요청 처리는 끝났지만 현재 표시 상태를 확인하지 못했습니다.';
  if (reason === 'SurfaceSettlementUnavailable')
    return '현재 호스트에서 서식 처리 완료를 확인할 수 없습니다.';
  if (reason === 'AtomicFontNamesUnavailable')
    return '모든 언어의 글꼴을 한 번에 적용할 수 있는 현재 경로가 없습니다.';
  if (reason === 'FormattingPreparing') return '현재 범위의 편집 권한을 확인하고 있습니다.';
  if (reason === 'FontNameRefreshRequired')
    return '글꼴은 반영됐지만 문서 상태를 다시 확인해야 합니다.';
  if (reason === 'SelectFontLanguage') return '변경할 언어를 선택해주세요.';
  if (reason === 'EmptyCharacterSelection' || reason === 'MissingSelection')
    return '글자 범위를 선택해주세요.';
  if (reason === 'ReadOnlyDocument' || reason === 'SelectionNotEditable')
    return '읽기 전용이거나 변경할 수 없는 선택입니다.';
  if (reason === 'InvalidFontName') return '글꼴 이름을 확인해주세요.';
  if (reason === 'LimitExceeded') return '글꼴 이름이 허용 길이를 초과했습니다.';
  return '현재 상태에서는 이 글꼴을 변경할 수 없습니다.';
}
export function createFontNameView(
  root: HTMLElement,
  callbacks: {
    onLanguage(value: string): void;
    onInput(value: string): void;
    onApply(): void;
    onCancel(): void;
  },
): FontNameView {
  const doc = root.ownerDocument;
  let composing = false,
    pending = false,
    disposed = false;
  const dismiss = () => {
    if (!disposed && !composing && !pending) callbacks.onCancel();
  };
  const layer = createDialogLayer(root, {
    role: 'font-name-dialog',
    title: '언어별 글꼴',
    mode: 'modal',
    onDismiss: dismiss,
  });
  layer.element.classList.add('hwp-font-name-dialog');
  const removals: (() => void)[] = [];
  const listen = (node: EventTarget, type: string, handler: EventListener) => {
    node.addEventListener(type, handler);
    removals.push(() => node.removeEventListener(type, handler));
  };
  const current = doc.createElement('table');
  current.setAttribute('aria-label', '현재 선택의 언어별 글꼴');
  const languageLabel = doc.createElement('label'),
    language = doc.createElement('select');
  language.setAttribute('aria-label', '변경할 글꼴 언어');
  language.dataset.role = 'font-name-language';
  languageLabel.append(doc.createTextNode('언어 '), language);
  const placeholder = doc.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '언어를 선택해주세요';
  language.append(placeholder);
  const representative = doc.createElement('option');
  representative.value = 'representative';
  representative.textContent = '대표';
  representative.title = '모든 언어의 글꼴 이름을 한 번에 적용';
  language.append(representative);
  const inputLabel = doc.createElement('label'),
    input = doc.createElement('input');
  input.type = 'text';
  input.maxLength = 4096;
  input.dataset.role = 'font-name-input';
  input.setAttribute('aria-label', '글꼴 이름');
  inputLabel.append(doc.createTextNode('글꼴 이름 '), input);
  const choiceLabel = doc.createElement('label'),
    choice = doc.createElement('select');
  choice.dataset.role = 'font-name-document-names';
  choice.setAttribute('aria-label', '문서의 글꼴 이름');
  choiceLabel.append(doc.createTextNode('문서의 글꼴 '), choice);
  const note = doc.createElement('p');
  note.textContent = '선택한 언어의 글꼴만 변경합니다. 문서에 없는 이름도 직접 입력할 수 있습니다.';
  const status = doc.createElement('p');
  status.dataset.role = 'font-name-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const apply = doc.createElement('button'),
    cancel = doc.createElement('button');
  apply.type = cancel.type = 'button';
  apply.textContent = '확인';
  cancel.textContent = '취소';
  apply.dataset.role = 'font-name-apply';
  cancel.dataset.role = 'font-name-cancel';
  const rows = new Map<CharacterFontLanguage, HTMLTableCellElement>();
  let previousSuggestions: readonly string[] | undefined;
  listen(language, 'change', () => {
    if (!disposed) callbacks.onLanguage(language.value);
  });
  listen(input, 'input', () => {
    if (!disposed) callbacks.onInput(input.value);
  });
  listen(choice, 'change', () => {
    if (!disposed && choice.value !== '') callbacks.onInput(choice.value);
  });
  listen(apply, 'click', () => {
    if (!disposed && !composing && !pending && !apply.disabled) callbacks.onApply();
  });
  listen(cancel, 'click', dismiss);
  listen(layer.element, 'compositionstart', () => {
    composing = true;
  });
  listen(layer.element, 'compositionend', () => {
    composing = false;
  });
  listen(layer.element, 'keydown', (event) => {
    const key = event as KeyboardEvent;
    if (key.defaultPrevented || composing || key.isComposing || key.keyCode === 229) return;
    if (key.key === 'Enter' && key.target === input && !apply.disabled) {
      key.preventDefault();
      callbacks.onApply();
    }
  });
  layer.body.append(current, languageLabel, inputLabel, choiceLabel, note, status);
  layer.footer.append(apply, cancel);
  return {
    getDialogElement: () => layer.element,
    update(state) {
      if (disposed) return;
      pending = state.pending;
      for (const id of state.languages) {
        let cell = rows.get(id);
        if (!cell) {
          const option = doc.createElement('option');
          option.value = id;
          option.textContent = labels[id];
          language.append(option);
          const row = doc.createElement('tr'),
            header = doc.createElement('th');
          header.setAttribute('scope', 'row');
          header.textContent = labels[id];
          cell = doc.createElement('td');
          cell.dataset.role = 'font-name-current-' + id;
          row.append(header, cell);
          current.append(row);
          rows.set(id, cell);
        }
        cell.textContent = fontNameLabel(state.values[id]);
        cell.dataset.kind = state.values[id].kind;
      }
      language.value = state.language ?? '';
      note.textContent =
        state.language === 'representative'
          ? '대표는 한글·영문·한자·일어·외국어·기호·사용자 글꼴을 한 번의 요청으로 변경합니다.'
          : '선택한 언어의 글꼴만 변경합니다. 문서에 없는 이름도 직접 입력할 수 있습니다.';
      if (input.value !== state.draft) input.value = state.draft;
      const representable = input.value === state.draft;
      if (previousSuggestions !== state.suggestions) {
        // 자식 제거로 live HTMLCollection이 바뀌므로 사본이 필요하다.
        // oxlint-disable-next-line unicorn/no-useless-spread
        for (const child of [...choice.children]) child.remove();
        const empty = doc.createElement('option');
        empty.value = '';
        empty.textContent = '문서의 이름 선택';
        choice.append(empty);
        for (const name of state.suggestions) {
          const option = doc.createElement('option');
          option.value = name;
          option.textContent = JSON.stringify(name);
          choice.append(option);
        }
        choice.value = '';
        previousSuggestions = state.suggestions;
      }
      const reason =
        state.language === 'representative'
          ? (state.representativeReason ?? null)
          : state.language
            ? state.reasons[state.language]
            : 'SelectFontLanguage';
      language.disabled = pending || state.refreshRequired || state.reopenRequired || state.stale;
      input.disabled =
        pending || state.refreshRequired || state.reopenRequired || state.stale || reason !== null;
      choice.disabled = input.disabled || !state.suggestions.length;
      apply.disabled = !state.canApply || !representable;
      cancel.disabled = pending;
      const x = layer.element.querySelector<HTMLButtonElement>('[data-role=dialog-dismiss]');
      if (x) x.disabled = pending;
      input.setAttribute('aria-invalid', String(!!state.error));
      status.dataset.reason = reason ?? '';
      status.textContent =
        state.reopenRequired && !state.refreshRequired
          ? (state.error ? reasonText(state.error) + ' ' : '') +
            '재시도하려면 창을 닫고 현재 범위를 다시 열어주세요.'
          : state.refreshRequired
            ? reasonText('FontNameRefreshRequired')
            : state.stale
              ? '문서나 선택이 바뀌었습니다. 창을 닫고 다시 열어주세요.'
              : pending
                ? '글꼴 이름을 반영하고 있습니다.'
                : !representable
                  ? '이 이름은 입력란에 그대로 표시할 수 없습니다.'
                  : reasonText(state.error ?? reason);
    },
    show() {
      if (!disposed) layer.show(language);
    },
    isComposing: () => composing,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of removals) remove();
      layer.destroy();
    },
  };
}
