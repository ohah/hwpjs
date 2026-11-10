import type {
  SelectionTarget,
  SetCharacterPropertiesPayload,
  SetParagraphAlignmentPayload,
} from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import { selectionMessage, validateSelection } from './selection.ts';
import { currentParagraphReference } from './current-paragraph-reference.ts';
import { validateOriginalParagraphReference } from './original-paragraph-reference.ts';
// @ts-ignore Canonical native facade argument encoder; no independent bit definitions.
import { characterPropertyArgs } from '../../../../js/character-property-args.mjs';
// @ts-ignore Shared canonical display alignment validator; native ordinals stay in the facade.
import { paragraphAlignmentValue } from '../../../../web/preview/paragraph-alignments.mjs';

export type FormattingCapability =
  | 'characterPropertiesAvailable'
  | 'paragraphAlignmentAvailable'
  | 'characterUnderlineAvailable'
  | 'characterStrikeAvailable'
  | 'characterTextColorAvailable'
  | 'characterFontNameAvailable';
export function validateFormattingTarget(
  target: SelectionTarget,
  state: EditorState,
  character: boolean,
  capability: FormattingCapability = character
    ? 'characterPropertiesAvailable'
    : 'paragraphAlignmentAvailable',
) {
  const row = validateSelection(target, state, true);
  if (row.createdCell) throw Error('CreatedCellRequiresSurfacePort');
  const position = character
    ? selectionMessage(target, state)
    : {
        section: target.section,
        paragraph: target.paragraph,
        startUnit: target.startUnit,
        endUnit: target.endUnit,
        reference: undefined,
      };
  const content = state.content as Record<string, unknown>;
  if (content[capability] !== true) throw Error('FormattingCapabilityUnavailable');
  // validateSelection proves the canonical object/list owner. Original nested
  // paragraphs use the same source ordinal ABI as original body text.
  if (
    !row.tableCell &&
    !row.drawingText &&
    !row.drawingCaption &&
    target.owner !== `section:${target.section}:body`
  )
    throw Error('UnsupportedFormattingOwner');
  const generated =
    target.format === 'hwp5' &&
    (row.currentReference as { kind?: unknown } | undefined)?.kind === 'generated';
  let reference: unknown;
  if (
    generated &&
    (capability === 'characterPropertiesAvailable' || capability === 'paragraphAlignmentAvailable')
  ) {
    reference = currentParagraphReference(
      row.currentReference,
      target.section,
      'UnsupportedFormattingReference',
    );
    if (
      target.owner !== `section:${target.section}:body` ||
      row.tableCell ||
      row.drawingText ||
      row.drawingCaption
    )
      throw Error('UnsupportedFormattingOwner');
  } else {
    validateOriginalParagraphReference(target, row, 'UnsupportedFormattingReference');
  }
  const { reference: _, ...range } = position;
  if (character && target.startUnit === target.endUnit) throw Error('EmptyCharacterSelection');
  return { ...range, ...(reference === undefined ? {} : { reference }) };
}

export function formattingMessage(
  payload: SetCharacterPropertiesPayload | SetParagraphAlignmentPayload,
  state: EditorState,
  character: boolean,
) {
  const range = validateFormattingTarget(payload.target, state, character);
  if (character) {
    const properties = (payload as SetCharacterPropertiesPayload).properties;
    characterPropertyArgs(properties);
    return { kind: 'character-properties', ...range, properties };
  }
  const alignment = (payload as SetParagraphAlignmentPayload).alignment;
  if (paragraphAlignmentValue(alignment) === undefined) throw Error('InvalidParagraphAlignment');
  return {
    kind: 'paragraph-alignment',
    section: range.section,
    paragraph: range.paragraph,
    alignment,
    ...(range.reference === undefined ? {} : { reference: range.reference }),
  };
}
