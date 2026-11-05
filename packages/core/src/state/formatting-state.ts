// @ts-ignore 기존 Canvas 입력 상속의 UTF16 caret span을 관측에만 재사용한다.
import { typingSourceSpan } from '../../../../web/preview/character-typing-properties.mjs';
// @ts-ignore 같은 scalar 경계·연속 source span 검증의 단일 출처.
import { characterRangeValues } from '../../../../web/preview/character-range-values.mjs';
import { characterFontNameObservations, type CharacterFontNameValue } from './font-name-state.ts';
import type { CharacterFontLanguage } from '../commands/commands.ts';
// @ts-ignore Canonical language partition order.
import { FONT_LANGUAGES } from '../../../../js/font-face-identity.mjs';
// @ts-ignore Public selection uses the canonical UTF-16 scalar boundary.
import { isUtf16Boundary } from '../../../../web/preview/utf16-boundary.mjs';
import { characterTextColorObservation } from './text-color-state.ts';
import type { EditorState } from './editor-state.ts';
import type { SelectionTarget } from '../commands/commands.ts';
import { validateSelection } from '../commands/selection.ts';
import { validateFormattingTarget, type FormattingCapability } from '../commands/formatting.ts';
// @ts-ignore Canonical readonly display projection, not native writer rules.
import { characterSelectionState } from '../../../../web/preview/character-property-selection.mjs';
// @ts-ignore Canonical readonly source size projection.
import { characterSizeState } from '../../../../web/preview/character-size-selection.mjs';
// @ts-ignore Canonical display enum; no duplicated ordinal table.
import { paragraphAlignmentKey } from '../../../../web/preview/paragraph-alignments.mjs';

export type FormattingValue<T> = T | 'mixed' | null;
export interface SelectionFormatting {
  readonly target: SelectionTarget | null;
  /** null means the command target is available; unknown observations remain null below. */
  readonly characterAvailableReason: string | null;
  readonly paragraphAvailableReason: string | null;
  readonly underlineAvailableReason: string | null;
  readonly strikeAvailableReason: string | null;
  readonly textColorAvailableReason: string | null;
  readonly fontNames: Readonly<Record<CharacterFontLanguage, CharacterFontNameValue>>;
  readonly fontNameAvailableReasons: Readonly<Record<CharacterFontLanguage, string | null>>;
  /** Canonical #rrggbb, mixed, or unknown null; not a CSS named color. */
  readonly textColor: FormattingValue<string>;
  readonly bold: FormattingValue<boolean>;
  readonly italic: FormattingValue<boolean>;
  readonly underline: FormattingValue<boolean>;
  readonly strike: FormattingValue<boolean>;
  /** Source units (1/100 point), never rounded for display here. */
  readonly size: FormattingValue<number>;
  readonly align: FormattingValue<string>;
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** Pure owned projection. It does not rebase stale selections or manufacture a cursor. */
export function getSelectionFormatting(state: EditorState): SelectionFormatting {
  const unavailable = (reason: string): SelectionFormatting =>
    Object.freeze({
      target: null,
      characterAvailableReason: reason,
      paragraphAvailableReason: reason,
      underlineAvailableReason: reason,
      strikeAvailableReason: reason,
      textColorAvailableReason: reason,
      fontNames: Object.freeze(
        Object.fromEntries(
          FONT_LANGUAGES.map((language: string) => [
            language,
            Object.freeze({ kind: 'unknown' as const }),
          ]),
        ),
      ) as Readonly<Record<CharacterFontLanguage, CharacterFontNameValue>>,
      fontNameAvailableReasons: Object.freeze(
        Object.fromEntries(FONT_LANGUAGES.map((language: string) => [language, reason])),
      ) as Readonly<Record<CharacterFontLanguage, string>>,
      textColor: null,
      bold: null,
      italic: null,
      underline: null,
      strike: null,
      size: null,
      align: null,
    });
  if (state.status !== 'ready')
    return unavailable(state.status === 'refresh-required' ? 'RefreshRequired' : 'EditorNotReady');
  const selection = state.selection;
  if (selection == null) return unavailable('MissingSelection');
  let target: SelectionTarget, row: ReturnType<typeof validateSelection>;
  try {
    const selected = selection as SelectionTarget;
    row = validateSelection(selected, state);
    target = Object.freeze({
      editorId: selected.editorId,
      documentId: selected.documentId,
      generation: selected.generation,
      operationRevision: selected.operationRevision,
      viewRevision: selected.viewRevision,
      coordinateSpace: selected.coordinateSpace,
      format: selected.format,
      owner: selected.owner,
      section: selected.section,
      paragraph: selected.paragraph,
      startUnit: selected.startUnit,
      endUnit: selected.endUnit,
      affinity: selected.affinity,
    });
  } catch (error) {
    return unavailable(message(error));
  }
  const reason = (character: boolean, capability?: FormattingCapability) => {
    try {
      validateFormattingTarget(target, state, character, capability);
      return null;
    } catch (error) {
      return message(error);
    }
  };
  const characterAvailableReason = reason(true),
    paragraphAvailableReason = reason(false);
  const underlineAvailableReason = reason(true, 'characterUnderlineAvailable');
  const strikeTargetReason = reason(true, 'characterStrikeAvailable');
  const content = state.content;
  const caret = target.startUnit === target.endUnit;
  const span = caret ? typingSourceSpan(row.text, target.startUnit) : null;
  const start = span?.start ?? target.startUnit;
  const end = span?.end ?? target.endUnit;
  // 토큰·owner가 확인된 행에서 같은 scalar 경계와 연속 span만 읽는다. Native 쓰기 참조는 만들지 않는다.
  const observedSpan = characterRangeValues(
    { paragraphs: [row] },
    [{ section: target.section, paragraph: target.paragraph, startUnit: start, endUnit: end }],
    () => true,
    { isBoundary: isUtf16Boundary },
  );
  const canObserve = (capability: string) =>
    observedSpan !== null && (content as Record<string, unknown>)[capability] === true;
  // Helpers deliberately consume display offsets, not the mapped native offsets.
  const bold = canObserve('characterPropertiesAvailable')
    ? characterSelectionState(content, row, start, end, 'bold')
    : null;
  const italic = canObserve('characterPropertiesAvailable')
    ? characterSelectionState(content, row, start, end, 'italic')
    : null;
  const underline = canObserve('characterUnderlineAvailable')
    ? characterSelectionState(content, row, start, end, 'underline')
    : null;
  const strike = canObserve('characterStrikeAvailable')
    ? characterSelectionState(content, row, start, end, 'strike')
    : null;
  const strikeAvailableReason =
    strikeTargetReason ?? (strike === null ? 'UnknownCharacterStrike' : null);
  const textColorTargetReason = reason(true, 'characterTextColorAvailable');
  const colorObservation = canObserve('characterTextColorAvailable')
    ? characterTextColorObservation(content, row, start, end)
    : null;
  const textColor = colorObservation?.value ?? null;
  const textColorAvailableReason =
    textColorTargetReason ?? (colorObservation?.bindingValid ? null : 'UnknownCharacterTextColor');
  const size = canObserve('characterPropertiesAvailable')
    ? characterSizeState(content, row, start, end, {
        isBoundary: isUtf16Boundary,
      })
    : null;
  // 문단 원본 enum 관측은 문자 span 및 Native 문단 쓰기 가용성과 독립이다.
  const align = paragraphAlignmentKey(
    (row as typeof row & { paragraphShape?: { alignment?: number } }).paragraphShape?.alignment,
  );
  const fontTargetReason = reason(true, 'characterFontNameAvailable');
  const fontObserved = characterFontNameObservations(content, row, start, end);
  const fontNames = Object.freeze(
    Object.fromEntries(
      FONT_LANGUAGES.map((language: CharacterFontLanguage) => [
        language,
        fontObserved[language].value,
      ]),
    ),
  ) as Readonly<Record<CharacterFontLanguage, CharacterFontNameValue>>;
  const fontNameAvailableReasons = Object.freeze(
    Object.fromEntries(
      FONT_LANGUAGES.map((language: CharacterFontLanguage) => [
        language,
        fontTargetReason ??
          (fontObserved[language].bindingValid ? null : 'UnknownCharacterFontName'),
      ]),
    ),
  ) as Readonly<Record<CharacterFontLanguage, string | null>>;
  return Object.freeze({
    target,
    characterAvailableReason,
    paragraphAvailableReason,
    underlineAvailableReason,
    strikeAvailableReason,
    textColorAvailableReason,
    fontNames,
    fontNameAvailableReasons,
    textColor,
    bold,
    italic,
    underline,
    strike,
    size,
    align,
  });
}
