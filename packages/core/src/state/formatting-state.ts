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
  // Helpers deliberately consume display offsets, not the mapped native offsets.
  const bold =
    characterAvailableReason === null
      ? characterSelectionState(content, row, target.startUnit, target.endUnit, 'bold')
      : null;
  const italic =
    characterAvailableReason === null
      ? characterSelectionState(content, row, target.startUnit, target.endUnit, 'italic')
      : null;
  const underline =
    underlineAvailableReason === null
      ? characterSelectionState(content, row, target.startUnit, target.endUnit, 'underline')
      : null;
  const strike =
    strikeTargetReason === null
      ? characterSelectionState(content, row, target.startUnit, target.endUnit, 'strike')
      : null;
  const strikeAvailableReason =
    strikeTargetReason ?? (strike === null ? 'UnknownCharacterStrike' : null);
  const textColorTargetReason = reason(true, 'characterTextColorAvailable');
  const colorObservation =
    textColorTargetReason === null
      ? characterTextColorObservation(content, row, target.startUnit, target.endUnit)
      : null;
  const textColor = colorObservation?.value ?? null;
  const textColorAvailableReason =
    textColorTargetReason ?? (colorObservation?.bindingValid ? null : 'UnknownCharacterTextColor');
  const size =
    characterAvailableReason === null
      ? characterSizeState(content, row, target.startUnit, target.endUnit, {
          isBoundary: isUtf16Boundary,
        })
      : null;
  const align =
    paragraphAvailableReason === null
      ? paragraphAlignmentKey(
          (row as typeof row & { paragraphShape?: { alignment?: number } }).paragraphShape
            ?.alignment,
        )
      : null;
  return Object.freeze({
    target,
    characterAvailableReason,
    paragraphAvailableReason,
    underlineAvailableReason,
    strikeAvailableReason,
    textColorAvailableReason,
    textColor,
    bold,
    italic,
    underline,
    strike,
    size,
    align,
  });
}
