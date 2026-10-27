import { validateOriginalParagraphReference } from './original-paragraph-reference.ts';
import { validateBorderPatch, validateBackgroundPatch } from './formatting-resource-intent.ts';
import type { SelectionTarget } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import { validateSelection } from './selection.ts';
// @ts-ignore Existing canonical display/source mapping.
import { sourceTextChange } from '../../../../web/preview/text-offsets.mjs';
// @ts-ignore Existing integer/range validators.
import { paragraphMarginArgs } from '../../../../js/paragraph-margin-args.mjs';
// @ts-ignore Existing spacing validator; Native owns format-specific units.
import { paragraphSpacingArgs } from '../../../../js/paragraph-spacing-args.mjs';
// @ts-ignore Existing shared alignment catalog.
import { paragraphAlignmentValue } from '../../../../web/preview/paragraph-alignments.mjs';
function object(v: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('InvalidFormattingPatch');
  if (Object.keys(v).some((k) => !allowed.includes(k))) throw Error('UnknownFormattingField');
  return v as Record<string, unknown>;
}
export function validateParagraphFormattingPatch(value: unknown): void {
  const root = object(value, ['paragraph']);
  if (!Object.hasOwn(root, 'paragraph')) throw Error('InvalidFormattingPatch');
  const p = object(root.paragraph, [
    'alignment',
    'margins',
    'spacing',
    'grid',
    'borderConnect',
    'border',
    'background',
  ]);
  if (p.alignment !== undefined && paragraphAlignmentValue(p.alignment) === undefined)
    throw Error('InvalidParagraphAlignment');
  if (p.margins !== undefined) {
    const m = object(p.margins, ['left', 'right', 'indent', 'before', 'after']);
    if (Object.values(m).some((v) => v === null)) throw Error('InvalidParagraphMargins');
    paragraphMarginArgs(m);
  }
  if (p.spacing !== undefined) {
    const v = object(p.spacing, ['kind', 'value']);
    const kinds = {
      percent: 'PERCENT',
      fixed: 'FIXED',
      between: 'BETWEEN_LINES',
      at_least: 'AT_LEAST',
    };
    paragraphSpacingArgs(kinds[v.kind as keyof typeof kinds], v.value);
  }
  for (const key of ['grid', 'borderConnect'])
    if (p[key] !== undefined && typeof p[key] !== 'boolean') throw Error('InvalidParagraphFlags');
  if (p.border !== undefined) validateBorderPatch(p.border);
  if (p.background !== undefined) validateBackgroundPatch(p.background);
}
/** The same canonical ownership proof as existing formatting, without requiring
 * unrelated legacy setter capability. Native rechecks the actual owner/ref. */
export function atomicSelector(
  target: SelectionTarget,
  state: EditorState,
  write: boolean,
  character: boolean,
) {
  const row = validateSelection(target, state, write);
  if (row.createdCell) throw Error('CreatedCellRequiresSurfacePort');
  if (
    !row.tableCell &&
    !row.drawingText &&
    !row.drawingCaption &&
    target.owner !== `section:${target.section}:body`
  )
    throw Error('UnsupportedFormattingOwner');
  validateOriginalParagraphReference(target, row, 'UnsupportedFormattingReference');
  let ranges: readonly { startUnit: number; endUnit: number }[] | undefined;
  if (character && target.startUnit !== target.endUnit) {
    const change = {
      section: target.section,
      paragraph: target.paragraph,
      startUnit: target.startUnit,
      endUnit: target.endUnit,
    };
    const mapped = target.format === 'hwp5' ? sourceTextChange(change, row.sourceOffsets) : change;
    if (mapped.endUnit - mapped.startUnit !== target.endUnit - target.startUnit)
      throw Error('ProtectedAnchorRange');
    ranges = [{ startUnit: mapped.startUnit, endUnit: mapped.endUnit }];
  }
  return {
    kind: 'original-paragraph',
    section: target.section,
    paragraph: target.paragraph,
    ...(ranges ? { ranges } : {}),
  };
}
