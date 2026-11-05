import type { HeadlessEditor } from '@hwpjs/core';
// @ts-ignore 원본 크기 관측의 기존 단일 출처. 쓰기 capability를 만들지 않는다.
import { characterSizeState } from '../../../web/preview/character-size-selection.mjs';
// @ts-ignore 공개 선택과 같은 UTF-16 경계.
import { isUtf16Boundary } from '../../../web/preview/utf16-boundary.mjs';
import type {
  CharacterFontLanguage,
  CharacterFontNameValue,
  SelectionFormatting,
} from '@hwpjs/core';
// @ts-ignore 원본 언어 partition 순서의 단일 출처.
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';
export const fontLanguageLabels: Record<CharacterFontLanguage, string> = {
  hangul: '한글',
  latin: '영문',
  hanja: '한자',
  japanese: '일어',
  other: '외국어',
  symbol: '기호',
  user: '사용자',
};
export function fontNameLabel(value: CharacterFontNameValue) {
  if (value.kind === 'mixed') return '서로 다른 글꼴';
  if (value.kind === 'unknown') return '알 수 없음';
  if (value.name === null) return '원본 이름을 확인할 수 없음';
  if (value.name === '') return '빈 원본 이름';
  return JSON.stringify(value.name);
}

/** 이미 public selector가 판정한 원본 이름만 표시한다. 기본 글꼴을 생성하지 않는다. */
export function selectionFontNameLabel(values: SelectionFormatting['fontNames']): string {
  const value = values.hangul;
  if (value.kind === 'unknown') return '글꼴 정보 미관측';
  if (value.kind === 'mixed') return '혼합 글꼴';
  if (value.name === null) return '원본 이름 미관측';
  if (value.name === '') return '빈 원본 이름';
  return value.name;
}
export function selectionFontNameTooltip(values: SelectionFormatting['fontNames']): string {
  return (
    '언어별 문서 원본 글꼴 · ' +
    (FONT_LANGUAGES as readonly CharacterFontLanguage[])
      .map((language) => `${fontLanguageLabels[language]}: ${fontNameLabel(values[language])}`)
      .join(' · ')
  );
}
export function formattingObservationLabels(
  state: SelectionFormatting,
  size: SelectionFormatting['size'] = state.size,
) {
  const fontSizeStatus =
    typeof size === 'number'
      ? 'single'
      : size === 'mixed'
        ? 'mixed'
        : state.characterAvailableReason === null ||
            state.characterAvailableReason === 'ReadOnlyDocument' ||
            state.characterAvailableReason === 'SelectionNotEditable'
          ? 'unknown'
          : 'unavailable';
  const fontSizeHint =
    fontSizeStatus === 'single'
      ? ''
      : fontSizeStatus === 'mixed'
        ? '혼합 크기'
        : fontSizeStatus === 'unknown'
          ? '크기 정보 미관측'
          : state.characterAvailableReason === 'MissingSelection'
            ? '선택 범위 크기 미관측'
            : state.characterAvailableReason === 'EmptyCharacterSelection'
              ? '커서 크기 미관측'
              : '현재 크기 관측 불가';
  return Object.freeze({
    fontNames: state.fontNames,
    fontName: selectionFontNameLabel(state.fontNames),
    fontNameTitle: selectionFontNameTooltip(state.fontNames),
    fontNameLanguage: 'hangul' as const,
    fontSizeStatus,
    fontSizeHint,
    // SDK05 SelectionFormatting에는 원본 문단 스타일 ID/name 필드가 없다.
    styleLabel: '스타일 이름 미관측',
  });
}

/** public selector가 이미 검증한 같은 선택의 원본 자료만 읽는다. writer 사유는 수정하지 않는다. */
export function readSelectionSize(
  coreState: ReturnType<HeadlessEditor['getEditorState']>,
  formatting: SelectionFormatting,
): SelectionFormatting['size'] {
  if (formatting.size !== null || coreState.status !== 'ready' || !formatting.target)
    return formatting.size;
  if (
    formatting.characterAvailableReason !== 'ReadOnlyDocument' &&
    formatting.characterAvailableReason !== 'SelectionNotEditable'
  )
    return formatting.size;
  const content = coreState.content as
    | { paragraphs?: readonly { section: number; paragraph: number }[] }
    | undefined;
  if (!Array.isArray(content?.paragraphs)) return null;
  const target = formatting.target;
  const rows = content.paragraphs.filter(
    (row) => row?.section === target.section && row?.paragraph === target.paragraph,
  );
  if (rows.length !== 1) return null;
  return characterSizeState(content, rows[0], target.startUnit, target.endUnit, {
    isBoundary: isUtf16Boundary,
  });
}
