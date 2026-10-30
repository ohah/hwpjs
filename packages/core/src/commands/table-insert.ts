import type { SelectionTarget } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import type { InsertTableOptions } from './table-insert-options.ts';
import { validateTableInsertOptions } from './table-insert-options.ts';
import { selectionMessage, validateSelection } from './selection.ts';
import { validateOriginalParagraphReference } from './original-paragraph-reference.ts';
export type { InsertTableOptions, TableInsertResources } from './table-insert-options.ts';
export interface InsertTablePayload {
  readonly target: SelectionTarget;
  readonly options: InsertTableOptions;
}
export function tableInsertMessage(payload: InsertTablePayload, state: EditorState) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Reflect.ownKeys(payload).length !== 2 ||
    !['target', 'options'].every((key) => Object.hasOwn(payload, key)) ||
    Reflect.ownKeys(payload).some(
      (key) =>
        typeof key !== 'string' ||
        !['target', 'options'].includes(key) ||
        !('value' in Object.getOwnPropertyDescriptor(payload, key)!),
    )
  )
    throw Error('InvalidTableInsertPayload');
  const target = payload.target,
    row = validateSelection(target, state, true);
  if (target.startUnit !== target.endUnit) throw Error('TableInsertionRequiresCaret');
  if (
    target.owner !== `section:${target.section}:body` ||
    row.tableCell ||
    row.createdCell ||
    row.drawingText ||
    row.drawingCaption
  )
    throw Error('UnsupportedTableInsertOwner');
  validateOriginalParagraphReference(target, row, 'UnsupportedTableInsertReference');
  const content = state.content as {
    tableCreationAvailable?: unknown;
    tableCreationResources?: unknown;
  };
  if (content.tableCreationAvailable !== true) throw Error('TableCreationUnavailable');
  const options = validateTableInsertOptions(payload.options, content.tableCreationResources);
  const mapped = selectionMessage(target, state);
  return {
    kind: 'insert-table',
    section: mapped.section,
    paragraph: mapped.paragraph,
    unit: mapped.startUnit,
    options,
  };
}
