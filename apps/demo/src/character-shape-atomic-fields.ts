import type { CharacterFormattingPatch, CharacterFontLanguage } from '@hwpjs/core';
import {
  BORDER_LINE_STYLES,
  BORDER_WIDTHS_HUNDREDTH_MM,
  BACKGROUND_HATCH_STYLES,
} from '@hwpjs/core';
import type { CharacterShapeDraft, CharacterShapePort } from './character-shape-port.ts';
// @ts-ignore 기존 언어 순서를 재사용한다.
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';
type Details = ReturnType<CharacterShapePort['atomic']>;
type Descriptor = {
  label: string;
  path: string[];
  field: string;
  kind: 'integer' | 'color' | 'text' | 'enum';
  values?: readonly string[];
};
/** 초안만 소유한다. 원본 ID, 서식값, 쓰기 가능 여부는 Native 조회가 소유한다. */
export function createCharacterAtomicFields(
  root: HTMLElement,
  onDraft: (draft: CharacterShapeDraft) => void,
) {
  const doc = root.ownerDocument,
    group = doc.createElement('fieldset'),
    legend = doc.createElement('legend');
  legend.textContent = '세부 글자 모양';
  group.append(legend);
  root.append(group);
  let state: { details: Details; draft: CharacterShapeDraft; locked: boolean } | undefined;
  const descriptors: Descriptor[] = [];
  const metricLabels = {
    ratio: '장평 (%)',
    charSpacing: '자간 (%)',
    relativeSize: '상대 크기 (%)',
    offset: '글자 위치 (%)',
  };
  const langLabels: Record<CharacterFontLanguage, string> = {
    hangul: '한글',
    latin: '영문',
    hanja: '한자',
    japanese: '일본어',
    other: '기타',
    symbol: '기호',
    user: '사용자',
  };
  for (const language of FONT_LANGUAGES as readonly CharacterFontLanguage[]) {
    descriptors.push({
      label: langLabels[language] + ' 글꼴 이름',
      path: ['fonts', language, 'name'],
      field: 'character.fontNames',
      kind: 'text',
    });
    for (const key of ['ratio', 'charSpacing', 'relativeSize', 'offset'] as const)
      descriptors.push({
        label: langLabels[language] + ' ' + metricLabels[key],
        path: [key, language],
        field: 'character.' + key,
        kind: 'integer',
      });
  }
  for (const [label, path, kind, values] of [
    ['밑줄 위치', ['underline', 'kind'], 'enum', ['none', 'bottom', 'center', 'top']],
    ['밑줄 선 모양', ['underline', 'style'], 'enum', undefined],
    ['밑줄 색', ['underline', 'color'], 'color', undefined],
    ['취소선 사용', ['strike', 'enabled'], 'enum', ['true', 'false']],
    ['취소선 선 모양', ['strike', 'style'], 'enum', undefined],
    ['취소선 색', ['strike', 'color'], 'color', undefined],
    ['음영 종류', ['shade', 'kind'], 'enum', ['none', 'color']],
    ['음영 색', ['shade', 'color'], 'color', undefined],
    ['외곽선', ['outlineKind'], 'enum', undefined],
    ['양각·음각', ['effects', 'relief'], 'enum', ['none', 'emboss', 'engrave']],
    ['위·아래 첨자', ['effects', 'script'], 'enum', ['normal', 'superscript', 'subscript']],
    ['그림자 종류', ['shadow', 'kind'], 'enum', ['none', 'drop', 'continuous']],
    ['그림자 가로 위치 (%)', ['shadow', 'offsetX'], 'integer', undefined],
    ['그림자 세로 위치 (%)', ['shadow', 'offsetY'], 'integer', undefined],
    ['그림자 색', ['shadow', 'color'], 'color', undefined],
  ] as const)
    descriptors.push({
      label,
      path: [...path],
      field: 'character.' + path.join('.'),
      kind,
      values,
    });
  // 테두리와 배경은 기존 공통 typed 리소스 의도를 그대로 구성한다.
  for (const edge of ['left', 'right', 'top', 'bottom'] as const)
    for (const [key, label, kind] of [
      ['style', '선 모양', 'enum'],
      ['widthHundredthMm', '굵기 (0.01mm)', 'enum'],
      ['color', '색', 'color'],
    ] as const)
      descriptors.push({
        label:
          { left: '왼쪽', right: '오른쪽', top: '위쪽', bottom: '아래쪽' }[edge] +
          ' 테두리 ' +
          label,
        path: ['border', edge, key],
        field: 'character.border',
        kind,
        values:
          key === 'widthHundredthMm'
            ? BORDER_WIDTHS_HUNDREDTH_MM.map(String)
            : key === 'style'
              ? BORDER_LINE_STYLES
              : undefined,
      });
  for (const [label, path, kind, values] of [
    ['배경 종류', ['background', 'kind'], 'enum', ['none', 'solid', 'hatch', 'linear']],
    ['단색 배경색', ['background', 'color'], 'color', undefined],
    ['무늬 바탕색', ['background', 'faceColor'], 'color', undefined],
    ['무늬 선 색', ['background', 'hatchColor'], 'color', undefined],
    ['무늬 종류', ['background', 'style'], 'enum', BACKGROUND_HATCH_STYLES],
    ['그라데이션 시작색', ['background', 'colors', '0'], 'color', undefined],
    ['그라데이션 끝색', ['background', 'colors', '1'], 'color', undefined],
    ['그라데이션 각도', ['background', 'angle'], 'integer', undefined],
    ['그라데이션 중심 가로', ['background', 'centerX'], 'integer', undefined],
    ['그라데이션 중심 세로', ['background', 'centerY'], 'integer', undefined],
    ['그라데이션 단계', ['background', 'step'], 'integer', undefined],
    ['그라데이션 단계 중심', ['background', 'stepCenter'], 'integer', undefined],
  ] as const)
    descriptors.push({ label, path: [...path], field: 'character.background', kind, values });
  const get = (value: unknown, path: readonly string[]): unknown =>
    path.reduce<unknown>(
      (v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined),
      value,
    );
  const rawInputs = new Map<string, string>();
  const entries = descriptors.map((d) => {
    const label = doc.createElement('label'),
      title = doc.createElement('span'),
      note = doc.createElement('small');
    label.className = 'hwp-character-row';
    title.textContent = d.label;
    const input = d.kind === 'enum' ? doc.createElement('select') : doc.createElement('input');
    input.dataset.role = 'character-atomic-' + d.path.join('-');
    input.setAttribute('aria-label', d.label);
    if (input.tagName === 'INPUT') (input as HTMLInputElement).type = 'text';
    const write = () => {
      rawInputs.set(d.path.join('.'), input.value);
      if (!state || state.locked || !state.details) return;
      const next = structuredClone(state.draft.atomic ?? {}) as Record<string, unknown>;
      let owner = next;
      for (const key of d.path.slice(0, -1)) {
        if (!owner[key] || typeof owner[key] !== 'object') owner[key] = key === 'colors' ? [] : {};
        owner = owner[key] as Record<string, unknown>;
      }
      const key = d.path.at(-1)!;
      if (input.value === '') delete owner[key];
      else
        owner[key] =
          d.path.join('.') === 'strike.enabled'
            ? input.value === 'true'
            : d.kind === 'integer' || d.path.at(-1) === 'widthHundredthMm'
              ? Number(input.value)
              : d.kind === 'color'
                ? /^#[0-9a-f]{6}$/i.test(input.value)
                  ? parseInt(input.value.slice(1), 16)
                  : NaN
                : input.value;
      onDraft({ ...state.draft, atomic: next as CharacterFormattingPatch });
    };
    input.addEventListener(d.kind === 'enum' ? 'change' : 'input', write);
    label.append(title, input, note);
    group.append(label);
    return { d, input, note };
  });
  const reset = doc.createElement('button');
  reset.type = 'button';
  reset.textContent = '문단 스타일의 글자 모양으로 초기화';
  reset.dataset.role = 'character-atomic-reset';
  reset.addEventListener('click', () => {
    if (state && !state.locked && state.details) {
      rawInputs.clear();
      onDraft({ reset: { basis: 'paragraph-style', scope: 'character' } });
    }
  });
  group.append(reset);
  return {
    update(details: Details, draft: CharacterShapeDraft, locked: boolean) {
      state = { details, draft, locked };
      group.hidden = !details;
      for (const { d, input, note } of entries) {
        const cap = details?.capability;
        const supported = cap?.atomic
          ? (cap.fields[d.field] ?? cap.fields['character.' + d.path[0]])
          : undefined;
        const observation =
          details?.query.observations.aggregate[d.field] ??
          details?.query.observations.aggregate['character.' + d.path[0]];
        const reason = !supported?.writable
          ? '이 엔진에서 지원하지 않습니다.'
          : !observation?.writable
            ? (observation?.writeUnavailableReason ?? '원본 서식을 확인할 수 없습니다.')
            : '';
        input.disabled = locked || !!reason;
        input.title = reason;
        if (d.kind === 'enum') {
          const values = supported?.enumValues
            ? d.values
              ? d.values.filter((value) => supported.enumValues!.includes(value))
              : supported.enumValues
            : (d.values ?? []);
          const wanted = ['', ...values];
          if (
            Array.from(input.children)
              .map((o) => (o as HTMLOptionElement).value)
              .join('|') !== wanted.join('|')
          ) {
            for (const old of Array.from(input.children)) old.remove();
            for (const v of wanted) {
              const option = doc.createElement('option');
              option.value = v;
              option.textContent = v || '유지';
              input.append(option);
            }
          }
        }
        const value = get(draft.atomic, d.path);
        input.value =
          rawInputs.get(d.path.join('.')) ??
          (value === undefined
            ? ''
            : d.kind === 'color' && typeof value === 'number'
              ? '#' + value.toString(16).padStart(6, '0')
              : String(value));
        note.textContent =
          reason ||
          '현재: ' +
            (observation?.state === 'known'
              ? JSON.stringify(observation.value)
              : observation?.state === 'mixed'
                ? '혼합'
                : '확인 불가');
      }
      reset.disabled =
        locked ||
        !details ||
        (details.capability.atomic && !details.capability.fields['reset.style']?.writable);
    },
  };
}
