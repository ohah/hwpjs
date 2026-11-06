import type { SelectionTarget } from '../commands/commands.ts';
import { validateSelection } from '../commands/selection.ts';
import type { EditorState } from '../state/editor-state.ts';
import { createParagraphSelection } from '../state/paragraph-selection.ts';
// @ts-ignore The fixed structural boundary is shared with Canvas navigation.
import { hwp5StructuralEditableStart } from '../../../../js/hwp5-structural-edit-boundary.mjs';

/** Only the constructor's verified empty body shape receives an initial caret.
 * HWP5's two protected display units map past its secd/cold source prefix.
 * This is not a general rule for skipping object replacement characters.
 */
export function createNewDocumentSelection(state: EditorState): SelectionTarget | undefined {
  const content = state.content as
    | {
        format?: unknown;
        readOnly?: unknown;
        paragraphs?: Array<{
          section?: unknown;
          paragraph?: unknown;
          text?: unknown;
          editable?: unknown;
          clipped?: unknown;
          selectionOwner?: unknown;
          tableCell?: unknown;
          drawingText?: unknown;
          drawingCaption?: unknown;
          createdCell?: unknown;
          sourceOffsets?: Array<{ at?: unknown; source?: unknown }>;
          textSourcePolicyError?: unknown;
          structuralAnchors?: Array<{
            kind?: unknown;
            paragraph?: unknown;
            source_unit?: unknown;
            current_unit?: unknown;
            unit?: unknown;
            control_node?: unknown;
          }>;
        }>;
      }
    | undefined;
  if (
    state.status !== 'ready' ||
    !content ||
    content.readOnly === true ||
    !Array.isArray(content.paragraphs) ||
    content.paragraphs.length !== 1
  )
    return;
  const row = content.paragraphs[0];
  if (
    !row ||
    row.section !== 0 ||
    row.paragraph !== 0 ||
    row.editable !== true ||
    row.clipped ||
    row.tableCell ||
    row.drawingText ||
    row.drawingCaption ||
    row.createdCell ||
    row.textSourcePolicyError != null ||
    row.selectionOwner !== 'section:0:body'
  )
    return;
  let startUnit: number;
  if (content.format === 'hwpx' && row.text === '') startUnit = 0;
  else if (
    content.format === 'hwp5' &&
    row.text === '\ufffc\ufffc' &&
    Array.isArray(row.sourceOffsets) &&
    row.sourceOffsets.length === 3 &&
    hwp5StructuralEditableStart(row) === 2
  )
    startUnit = 2;
  else return;
  try {
    const target = createParagraphSelection(state, { section: 0, paragraph: 0, startUnit });
    validateSelection(target, state, true);
    return target;
  } catch {
    // Custom factories may expose an unverified observation; do not guess a position.
    return;
  }
}
