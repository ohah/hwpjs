import { createCharacterAtomicFields } from './character-shape-atomic-fields.ts';
import { createDialogLayer } from './dialog-layer.ts';
import { characterSizeFromPoints } from './formatting-bridge.ts';
import { fontNameLabel } from './font-name-view.ts';
import type { CharacterFontLanguage } from '@hwpjs/core';
// @ts-ignore Canonical language partition order, not a second Native ID table.
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';
import type { CharacterShapeDraft, CharacterShapeObservation } from './character-shape-port.ts';
import './character-shape.css';
export interface CharacterShapeViewState {
  observation: CharacterShapeObservation;
  draft: CharacterShapeDraft;
  language: CharacterFontLanguage | '';
  pending: boolean;
  stale: boolean;
  refreshRequired: boolean;
  error: string | null;
  canApply: boolean;
  atomicDetails?: ReturnType<import('./character-shape-port.ts').CharacterShapePort['atomic']>;
}
export function createCharacterShapeView(
  root: HTMLElement,
  callbacks: {
    onDraft(draft: CharacterShapeDraft): void;
    onLanguage(language: CharacterFontLanguage | ''): void;
    onApply(): void;
    onDismiss(): void;
  },
) {
  const doc = root.ownerDocument;
  let composing = false,
    last229 = false,
    disposed = false;
  let current: CharacterShapeViewState | undefined;
  const dismiss = () => {
    if (!disposed && !composing && !last229 && !current?.pending) callbacks.onDismiss();
  };
  const layer = createDialogLayer(root, {
    role: 'character-shape',
    title: '글자 모양',
    mode: 'modal',
    onDismiss: dismiss,
  });
  layer.element.classList.add('hwp-character-shape');
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, role: string, text = '') => {
    const node = doc.createElement(tag);
    node.dataset.role = role;
    node.textContent = text;
    return node;
  };
  const tabs = el('div', 'character-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '글자 모양');
  const panels = [el('section', 'character-basic'), el('section', 'character-extension')];
  const tabButtons = ['기본', '확장'].map((text, i) => {
    const button = el('button', 'character-tab-' + i, text);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => selectTab(i));
    button.addEventListener('keydown', (event) => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'Home' ||
        event.key === 'End'
      ) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - i;
        selectTab(next);
        tabButtons[next].focus();
      }
    });
    tabs.append(button);
    return button;
  });
  function selectTab(index: number) {
    panels.forEach((p, i) => {
      p.hidden = i !== index;
    });
    tabButtons.forEach((b, i) => {
      b.setAttribute('aria-selected', String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
  }
  selectTab(0);
  layer.body.append(tabs, ...panels);
  const controls: { node: HTMLInputElement | HTMLSelectElement; why: () => string | null }[] = [];
  const row = (parent: HTMLElement, label: string, role: string) => {
    const wrap = el('label', role + '-row'),
      name = el('span', role + '-label', label),
      note = el('small', role + '-current');
    wrap.className = 'hwp-character-row';
    wrap.append(name);
    parent.append(wrap);
    return { wrap, note };
  };
  const changed = (patch: Partial<CharacterShapeDraft>) => {
    if (current && !current.pending && !current.stale && !current.refreshRequired)
      callbacks.onDraft({ ...current.draft, ...patch });
  };
  const scalar = (label: string, key: 'size' | 'bold' | 'italic') => {
    const r = row(panels[0], label, 'character-' + key),
      input = doc.createElement(key === 'size' ? 'input' : 'select');
    input.dataset.role = 'character-' + key;
    input.setAttribute('aria-label', label);
    if (key === 'size') {
      (input as HTMLInputElement).type = 'text';
      (input as HTMLInputElement).inputMode = 'decimal';
    } else
      for (const [value, text] of [
        ['', '유지'],
        ['true', '켜기'],
        ['false', '끄기'],
      ]) {
        const o = doc.createElement('option');
        o.value = value;
        o.textContent = text;
        input.append(o);
      }
    input.addEventListener(key === 'size' ? 'input' : 'change', () => {
      if (!current) return;
      const properties = { ...current.draft.properties };
      if (!input.value) delete properties[key];
      else if (key === 'size') {
        try {
          properties.size = characterSizeFromPoints(Number(input.value));
        } catch {
          properties.size = NaN;
        }
      } else properties[key] = input.value === 'true';
      changed({ properties });
    });
    r.wrap.append(input, r.note);
    controls.push({
      node: input,
      why: () => {
        const details = current?.atomicDetails;
        if (!details) return current!.observation.formatting.characterAvailableReason;
        const field = 'character.' + key;
        if (!details.capability.atomic || !details.capability.fields[field]?.writable)
          return '이 엔진에서 지원하지 않습니다.';
        const observation = details.query.observations.aggregate[field];
        return observation?.writable
          ? null
          : (observation?.writeUnavailableReason ?? '원본 서식을 확인할 수 없습니다.');
      },
    });
    return { input, note: r.note };
  };
  const size = scalar('기준 크기 (pt)', 'size'),
    bold = scalar('굵게', 'bold'),
    italic = scalar('기울임', 'italic');
  const fontRow = row(panels[0], '언어별 글꼴', 'character-font'),
    language = el('select', 'character-font-language'),
    font = el('input', 'character-font-name');
  language.setAttribute('aria-label', '글꼴 언어');
  font.setAttribute('aria-label', '글꼴 이름');
  font.type = 'text';
  const labels: Record<CharacterFontLanguage, string> = {
    hangul: '한글',
    latin: '영문',
    hanja: '한자',
    japanese: '일본어',
    other: '기타',
    symbol: '기호',
    user: '사용자',
  };
  for (const id of ['', ...FONT_LANGUAGES] as (CharacterFontLanguage | '')[]) {
    const o = doc.createElement('option');
    o.value = id;
    o.textContent = id ? labels[id] : '언어 선택';
    language.append(o);
  }
  language.addEventListener('change', () =>
    callbacks.onLanguage(language.value as CharacterFontLanguage | ''),
  );
  font.addEventListener('input', () => {
    if (current?.language) changed({ font: { language: current.language, name: font.value } });
  });
  const fontKeep = el('button', 'character-font-keep', '이 언어의 변경 취소');
  fontKeep.type = 'button';
  fontKeep.addEventListener('click', () => changed({ font: undefined }));
  fontRow.wrap.append(language, font, fontKeep, fontRow.note);
  controls.push(
    { node: language, why: () => null },
    {
      node: font,
      why: () =>
        current?.language
          ? current.observation.formatting.fontNameAvailableReasons[current.language]
          : 'SelectFontLanguage',
    },
  );
  const colorRow = row(panels[0], '글자 색 (#RRGGBB)', 'character-color'),
    color = el('input', 'character-color');
  color.type = 'text';
  color.setAttribute('aria-label', '글자 색 #RRGGBB');
  color.addEventListener('input', () => changed({ color: color.value || undefined }));
  colorRow.wrap.append(color, colorRow.note);
  controls.push({
    node: color,
    why: () => current!.observation.formatting.textColorAvailableReason,
  });
  const enumRow = (
    label: string,
    key: 'underline' | 'strike',
    options: readonly (readonly [string, string])[],
  ) => {
    const r = row(panels[1], label, 'character-' + key),
      input = el('select', 'character-' + key);
    input.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const o = doc.createElement('option');
      o.value = value;
      o.textContent = text;
      input.append(o);
    }
    input.addEventListener('change', () =>
      changed(
        key === 'underline'
          ? { underline: input.value ? (input.value as 'none' | 'bottom') : undefined }
          : { strike: input.value ? input.value === 'true' : undefined },
      ),
    );
    r.wrap.append(input, r.note);
    controls.push({
      node: input,
      why: () =>
        key === 'underline'
          ? current!.observation.formatting.underlineAvailableReason
          : current!.observation.formatting.strikeAvailableReason,
    });
    return r.note;
  };
  const underlineNote = enumRow('밑줄 위치', 'underline', [
    ['', '유지'],
    ['none', '없음'],
    ['bottom', '아래'],
  ]);
  const strikeNote = enumRow('취소선 사용', 'strike', [
    ['', '유지'],
    ['true', '켜기'],
    ['false', '끄기'],
  ]);
  const legacyUnavailable: HTMLElement[] = [];
  for (const [panel, names] of [
    [panels[0], ['상대 크기', '장평', '자간', '글자 위치', '음영 색']],
    [
      panels[1],
      [
        '밑줄 위/가운데 위치',
        '밑줄 선 모양·색',
        '취소선 선 모양·색',
        '외곽선·그림자·양각·음각',
        '위·아래 첨자',
        '테두리·배경',
        '전체 서식 초기화',
      ],
    ],
  ] as const) {
    const group = el('fieldset', 'character-unavailable'),
      legend = el('legend', 'character-unavailable-title', '아직 통합 적용하지 않는 항목');
    group.append(legend);
    group.dataset.role = 'character-legacy-unavailable';
    for (const name of names) {
      const input = el('input', 'character-unavailable-field');
      input.type = 'text';
      input.disabled = true;
      input.value = name;
      input.setAttribute('aria-label', name);
      input.title =
        '현행 공개 typed 글자 명령에 연결되지 않았습니다. Native 미지원으로 단정하지 않습니다.';
      group.append(input);
    }
    panel.append(group);
    legacyUnavailable.push(group);
  }
  const atomicFields = createCharacterAtomicFields(panels[1], (draft) => callbacks.onDraft(draft));
  const limit = el(
    'p',
    'character-temporary-limit',
    '임시 연결: 기본 3속성 또는 색 또는 한 언어의 글꼴 또는 밑줄 또는 취소선 중 한 명령군만 확인할 수 있습니다. 여러 군의 동시 원자 적용은 준비 중입니다.',
  );
  const status = el('p', 'character-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  layer.body.append(limit, status);
  const confirm = el('button', 'character-confirm', '확인'),
    cancel = el('button', 'character-cancel', '취소');
  confirm.type = cancel.type = 'button';
  layer.footer.append(confirm, cancel);
  const apply = () => {
    if (
      !disposed &&
      !composing &&
      !last229 &&
      current?.canApply &&
      !current.pending &&
      !current.stale &&
      !current.refreshRequired
    )
      callbacks.onApply();
  };
  confirm.addEventListener('click', apply);
  cancel.addEventListener('click', dismiss);
  layer.element.addEventListener('compositionstart', () => {
    composing = true;
    refresh();
  });
  layer.element.addEventListener('compositionend', () => {
    composing = false;
    last229 = false;
    refresh();
  });
  layer.element.addEventListener('keyup', () => {
    last229 = false;
    refresh();
  });
  layer.element.addEventListener('keydown', (event) => {
    last229 = event.keyCode === 229;
    if (composing || event.isComposing || last229) return;
    if (event.key === 'Enter' && (event.target as Element).tagName === 'INPUT') {
      event.preventDefault();
      apply();
    }
  });
  const setValue = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
    if (input.value !== value) input.value = value;
  };
  const val = (value: unknown) =>
    value === null
      ? '미확인'
      : value === 'mixed'
        ? '혼합'
        : value === true
          ? '켜짐'
          : value === false
            ? '꺼짐'
            : String(value);
  function refresh() {
    if (!current) return;
    for (const group of legacyUnavailable) group.hidden = !!current.atomicDetails;
    atomicFields.update(
      current.atomicDetails,
      current.draft,
      current.pending || current.stale || current.refreshRequired,
    );
    limit.textContent = current.atomicDetails
      ? '지원하는 글자 모양의 변경분을 한 번에 적용합니다.'
      : '이 엔진에서는 한 명령군씩 적용할 수 있습니다. 여러 군의 동시 적용은 지원하지 않습니다.';
    const f = current.observation.formatting,
      locked = current.pending || current.stale || current.refreshRequired;
    for (const c of controls) {
      const why = c.why();
      c.node.disabled = locked || !!why;
      c.node.title = why || '';
    }
    if (!current.draft.properties || current.draft.properties.size === undefined) {
      const value = typeof f.size === 'number' ? String(f.size / 100) : '';
      setValue(size.input, value);
    }
    size.note.textContent =
      '현재: ' + (typeof f.size === 'number' ? f.size / 100 + 'pt' : val(f.size));
    bold.note.textContent = '현재: ' + val(f.bold);
    italic.note.textContent = '현재: ' + val(f.italic);
    setValue(language, current.language);
    const original = current.language ? f.fontNames[current.language] : null;
    const fontValue =
      current.draft.font?.language === current.language
        ? current.draft.font.name
        : original?.kind === 'single' && original.name !== null
          ? original.name
          : '';
    setValue(font, fontValue);
    fontRow.note.textContent = original
      ? '현재: ' + fontNameLabel(original)
      : '언어를 선택하면 현재 원본 이름을 표시합니다.';
    colorRow.note.textContent = '현재: ' + val(f.textColor);
    underlineNote.textContent =
      '현재 사용: ' + val(f.underline) + ' · 켜짐만으로 정확한 위치를 추정하지 않습니다.';
    strikeNote.textContent = '현재: ' + val(f.strike);
    fontKeep.disabled = locked || !current.draft.font;
    confirm.disabled = locked || composing || last229 || !current.canApply;
    cancel.disabled = current.pending;
    const x = layer.element.querySelector<HTMLButtonElement>('[data-role=dialog-dismiss]');
    if (x) x.disabled = current.pending;
    status.textContent = current.refreshRequired
      ? '이미 반영됐습니다. 닫고 문서 상태를 다시 확인하세요.'
      : current.stale
        ? '선택 또는 문서 상태가 바뀌었습니다. 닫고 다시 열어주세요.'
        : current.error === 'AtomicCharacterMultiGroupUnavailable'
          ? '여러 명령군의 동시 적용은 아직 지원하지 않습니다. 초안을 지우지 않았습니다.'
          : current.error || '';
  }
  return {
    update(state: CharacterShapeViewState) {
      current = state;
      refresh();
    },
    show() {
      layer.show(!size.input.disabled ? size.input : cancel);
    },
    focus() {
      (!size.input.disabled ? size.input : cancel).focus();
    },
    isComposing: () => composing || last229,
    dispose() {
      if (disposed) return;
      disposed = true;
      layer.destroy();
    },
  };
}
export type CharacterShapeView = ReturnType<typeof createCharacterShapeView>;
